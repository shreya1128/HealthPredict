"""Sliding-window rate limiter for auth endpoints.

Supports distributed Redis backend when REDIS_URL is configured,
with transparent local sliding-window fallback for single-node / dev environments.
"""

import logging
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.config.settings import settings

logger = logging.getLogger(__name__)


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)
        self._redis_client = None
        self._redis_initialized = False

    def _get_redis(self):
        if not self._redis_initialized:
            self._redis_initialized = True
            if settings.REDIS_URL:
                import re
                safe_url = re.sub(r'://([^:@]*):([^@]+)@', r'://\1:***@', settings.REDIS_URL)
                try:
                    import redis
                    self._redis_client = redis.Redis.from_url(
                        settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2
                    )
                    self._redis_client.ping()
                    logger.info("Connected distributed rate limiter to Redis at %s", safe_url)
                except Exception as e:
                    safe_err = re.sub(r'://([^:@]*):([^@]+)@', r'://\1:***@', str(e))
                    if settings.ENVIRONMENT == "production":
                        raise RuntimeError(
                            f"Configured Redis is unreachable in production environment: {safe_err}"
                        )
                    logger.warning("Redis rate limiter unavailable (%s). Falling back to local in-memory.", safe_err)
                    self._redis_client = None
        return self._redis_client

    def check(self, key: str) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return

        r = self._get_redis()
        if r is not None:
            try:
                now_ts = time.time()
                pipeline = r.pipeline()
                redis_key = f"rl:{key}"
                pipeline.zremrangebyscore(redis_key, 0, now_ts - self.window)
                pipeline.zadd(redis_key, {f"{now_ts}:{time.monotonic()}": now_ts})
                pipeline.zcard(redis_key)
                pipeline.expire(redis_key, self.window + 1)
                results = pipeline.execute()
                count = results[2]
                if count > self.limit:
                    raise HTTPException(
                        status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Please wait a moment and try again."
                    )
                return
            except HTTPException:
                raise
            except Exception as e:
                logger.debug("Redis rate check error (%s), using local fallback", e)

        # Local sliding window
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Please wait a moment and try again."
            )
        hits.append(now)

        # Periodic cleanup: prune stale keys to prevent memory leak
        if len(self._hits) > 1000:
            stale_keys = [k for k, dq in self._hits.items() if not dq or now - dq[-1] > self.window]
            for k in stale_keys:
                del self._hits[k]

    def reset(self) -> None:
        self._hits.clear()
        r = self._get_redis()
        if r is not None:
            try:
                keys = r.keys("rl:*")
                if keys:
                    r.delete(*keys)
            except Exception:
                pass


auth_limiter = RateLimiter(settings.LOGIN_RATE_LIMIT, settings.LOGIN_RATE_WINDOW_SECONDS)
ip_ceiling_limiter = RateLimiter(settings.LOGIN_RATE_LIMIT * 5, settings.LOGIN_RATE_WINDOW_SECONDS)


def reset_all_limiters() -> None:
    auth_limiter.reset()
    ip_ceiling_limiter.reset()


def _get_client_ip(request: Request) -> str:
    client_host = request.client.host if request.client else "unknown"
    trusted = settings.trusted_proxies_list
    if trusted and client_host in trusted:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # First IP in X-Forwarded-For is client
            return forwarded.split(",")[0].strip()
    return client_host


async def rate_limit_auth(request: Request) -> None:
    import re
    ip = _get_client_ip(request)
    path = request.url.path

    # Normalize tokens and dynamic path variables so brute-forcing different tokens is properly rate-limited per IP
    # e.g. /api/reports/doctor-summary/public/{token} -> /api/reports/doctor-summary/public/_token_
    normalized_path = re.sub(r'/(public)/[^/]+', r'/\1/_token_', path)
    normalized_path = re.sub(r'/[a-zA-Z0-9_\-]{20,}', '/_token_', normalized_path)

    # Loose per-IP ceiling to prevent network-wide DDoS attacks
    ip_ceiling_limiter.check(f"ip_ceiling:{normalized_path}:{ip}")

    # For login requests, key by IP and normalized email so one user failure doesn't lock out other users on same IP
    if path.endswith("/login") and request.method == "POST":
        try:
            body = await request.body()
            import json
            data = json.loads(body) if body else {}
            email = str(data.get("email", "")).strip().lower()
        except Exception:
            email = ""
        if email:
            auth_limiter.check(f"login:{email}:{ip}")
            return

    # Default rate limit key uses normalized path
    auth_limiter.check(f"{normalized_path}:{ip}")

