"""
Email sending utility.

In development (with MailHog): emails land at http://localhost:8025.
In production: configure SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/SMTP_TLS.

Usage:
    from app.utils.email import send_email
    await send_email(to="user@example.com", subject="...", html_body="...")
"""

import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config.settings import settings

logger = logging.getLogger(__name__)

TEST_OUTBOX: list[dict] = []


def get_test_outbox() -> list[dict]:
    return list(TEST_OUTBOX)


def clear_test_outbox() -> None:
    TEST_OUTBOX.clear()


def send_email(*, to: str, subject: str, html_body: str, text_body: str = "") -> bool:
    """Send an email.

    Supports:
    1. In-memory test outbox (when EMAIL_BACKEND == 'memory')
    2. Console output for development without mail server (when EMAIL_BACKEND == 'console')
    3. Resend Transactional Email API (if RESEND_API_KEY is configured)
    4. SendGrid v3 Mail API (if SENDGRID_API_KEY is configured)
    5. Production SMTP with SSL (port 465) or STARTTLS (port 587)
    6. Development MailHog (port 1025) or safe logging fallback.

    Never raises — a failed email should not break the caller's flow.
    """
    backend = getattr(settings, "EMAIL_BACKEND", "smtp").lower()
    if backend == "memory":
        TEST_OUTBOX.append({
            "to": to,
            "subject": subject,
            "html_body": html_body,
            "text_body": text_body,
        })
        logger.info("[email-outbox-recorded] to=%s subject=%s", to, subject)
        return True

    if backend == "console":
        logger.info("[email-console] To: %s | Subject: %s", to, subject)
        return True

    # 1. Cloud HTTP API: Resend
    if getattr(settings, "RESEND_API_KEY", None):
        try:
            import json
            import urllib.request
            payload = json.dumps({
                "from": settings.SMTP_FROM,
                "to": [to],
                "subject": subject,
                "html": html_body,
                "text": text_body or None,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=payload,
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status in (200, 201):
                    logger.info("[email-sent-resend] to=%s subject=%s", to, subject)
                    return True
        except Exception as exc:  # noqa: BLE001
            logger.error("[email-failed-resend] to=%s error=%s", to, exc)

    # 2. Cloud HTTP API: SendGrid
    if getattr(settings, "SENDGRID_API_KEY", None):
        try:
            import json
            import urllib.request
            payload = json.dumps({
                "personalizations": [{"to": [{"email": to}]}],
                "from": {"email": settings.SMTP_FROM},
                "subject": subject,
                "content": [
                    {"type": "text/html", "value": html_body},
                ],
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.sendgrid.com/v3/mail/send",
                data=payload,
                headers={
                    "Authorization": f"Bearer {settings.SENDGRID_API_KEY}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status in (200, 202):
                    logger.info("[email-sent-sendgrid] to=%s subject=%s", to, subject)
                    return True
        except Exception as exc:  # noqa: BLE001
            logger.error("[email-failed-sendgrid] to=%s error=%s", to, exc)

    # 3. Standard SMTP (Local / Staging / Production)
    if not settings.SMTP_HOST or settings.SMTP_HOST == "disabled":
        logger.info("[email-skipped] to=%s subject=%s", to, subject)
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM
        msg["To"] = to

        if text_body:
            msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        if getattr(settings, "SMTP_SSL", False):
            # Port 465 SSL
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=context, timeout=15) as server:
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM, [to], msg.as_string())
        elif settings.SMTP_TLS:
            # Port 587 STARTTLS
            context = ssl.create_default_context()
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
                server.ehlo()
                server.starttls(context=context)
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM, [to], msg.as_string())
        else:
            # Plain SMTP (e.g. MailHog port 1025)
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM, [to], msg.as_string())

        logger.info("[email-sent-smtp] to=%s subject=%s", to, subject)
        return True

    except Exception as exc:  # noqa: BLE001
        logger.error("[email-failed-smtp] to=%s subject=%s error=%s", to, subject, exc)
        return False


def _reset_link(token: str) -> str:
    return f"{settings.APP_URL}/reset-password?token={token}"


def _verify_link(token: str) -> str:
    return f"{settings.APP_URL}/verify-email?token={token}"


def send_password_reset(to: str, full_name: str, token: str) -> bool:
    link = _reset_link(token)
    first = full_name.split()[0] if full_name else "there"
    html = f"""
    <html><body style="font-family:system-ui,sans-serif;color:#1e293b;max-width:560px;margin:0 auto">
      <div style="background:#0f766e;padding:24px 32px;border-radius:12px 12px 0 0">
        <h1 style="color:white;margin:0;font-size:22px">HealthPredict</h1>
      </div>
      <div style="background:#f8fafc;padding:32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">
        <h2 style="margin:0 0 12px">Reset your password</h2>
        <p>Hi {first},</p>
        <p>We received a request to reset your HealthPredict password. Click the button below to choose a new password.
           This link expires in {settings.PASSWORD_RESET_EXPIRE_MINUTES} minutes.</p>
        <p style="margin:24px 0">
          <a href="{link}"
             style="background:#0f766e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
            Reset my password
          </a>
        </p>
        <p style="color:#64748b;font-size:13px">
          If you didn't request this, you can safely ignore this email. Your password won't change.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px">HealthPredict · For educational and wellness purposes only. Not a medical diagnosis.</p>
      </div>
    </body></html>
    """
    text = f"Hi {first},\n\nReset your HealthPredict password:\n{link}\n\nExpires in {settings.PASSWORD_RESET_EXPIRE_MINUTES} minutes."
    if getattr(settings, "EMAIL_BACKEND", "").lower() == "console":
        logger.info("[password-reset-link] Link for %s: %s", to, link)
    return send_email(to=to, subject="Reset your HealthPredict password", html_body=html, text_body=text)


def send_welcome(to: str, full_name: str, token: str) -> bool:
    link = _verify_link(token)
    first = full_name.split()[0] if full_name else "there"
    html = f"""
    <html><body style="font-family:system-ui,sans-serif;color:#1e293b;max-width:560px;margin:0 auto">
      <div style="background:#0f766e;padding:24px 32px;border-radius:12px 12px 0 0">
        <h1 style="color:white;margin:0;font-size:22px">HealthPredict</h1>
      </div>
      <div style="background:#f8fafc;padding:32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">
        <h2 style="margin:0 0 12px">Welcome, {first}!</h2>
        <p>Your account is ready. Verify your email to unlock all features.</p>
        <p style="margin:24px 0">
          <a href="{link}"
             style="background:#0f766e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
            Verify my email
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px">HealthPredict · For educational and wellness purposes only. Not a medical diagnosis.</p>
      </div>
    </body></html>
    """
    text = f"Hi {first},\n\nVerify your email:\n{link}"
    if getattr(settings, "EMAIL_BACKEND", "").lower() == "console":
        logger.info("[verify-email-link] Link for %s: %s", to, link)
    return send_email(to=to, subject="Verify your HealthPredict email", html_body=html, text_body=text)


def send_caregiver_invitation(to: str, inviter_name: str, token: str, access_level: str) -> bool:
    link = f"{settings.APP_URL.rstrip('/')}/caregivers/accept?token={token}"
    level_label = "edit (view and update records)" if access_level == "EDIT" else "view-only"
    html = f"""
    <html><body style="font-family:system-ui,sans-serif;color:#1e293b;max-width:560px;margin:0 auto">
      <div style="background:#0f766e;padding:24px 32px;border-radius:12px 12px 0 0">
        <h1 style="color:white;margin:0;font-size:22px">HealthPredict</h1>
      </div>
      <div style="background:#f8fafc;padding:32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">
        <h2 style="margin:0 0 12px">Caregiver Invitation</h2>
        <p>{inviter_name} has invited you to be their caregiver on HealthPredict with {level_label} access.</p>
        <p>As a caregiver, you can stay updated on their health entries, medication schedule, and care needs.</p>
        <p style="margin:24px 0">
          <a href="{link}"
             style="background:#0f766e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
            Accept Caregiver Invitation
          </a>
        </p>
        <p style="color:#64748b;font-size:13px">
          If you don't have an account yet, you will be prompted to create one with this email address first.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px">HealthPredict · For educational and wellness purposes only. Not a medical diagnosis.</p>
      </div>
    </body></html>
    """
    text = f"{inviter_name} invited you to be their caregiver on HealthPredict ({level_label} access).\n\nAccept invitation:\n{link}"
    if getattr(settings, "EMAIL_BACKEND", "").lower() == "console":
        logger.info("[caregiver-invite-link] Link for %s: %s", to, link)
    return send_email(to=to, subject=f"{inviter_name} invited you to be their caregiver on HealthPredict", html_body=html, text_body=text)


def send_account_deleted(to: str, full_name: str) -> bool:
    first = full_name.split()[0] if full_name else "there"
    html = f"""
    <html><body style="font-family:system-ui,sans-serif;color:#1e293b;max-width:560px;margin:0 auto">
      <div style="background:#0f766e;padding:24px 32px;border-radius:12px 12px 0 0">
        <h1 style="color:white;margin:0;font-size:22px">HealthPredict</h1>
      </div>
      <div style="background:#f8fafc;padding:32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">
        <h2 style="margin:0 0 12px">Account Permanently Deleted</h2>
        <p>Hello {first},</p>
        <p>As requested, your HealthPredict account and all associated health records, medications, and profiles have been permanently removed.</p>
        <p>If you did not make this request, please contact our support team immediately.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px">HealthPredict · For educational and wellness purposes only. Not a medical diagnosis.</p>
      </div>
    </body></html>
    """
    text = f"Hello {first},\n\nYour HealthPredict account and all associated health records have been permanently removed."
    return send_email(to=to, subject="Your HealthPredict account has been deleted", html_body=html, text_body=text)


def send_email_change_verification(to: str, full_name: str, token: str) -> bool:
    link = f"{settings.APP_URL.rstrip('/')}/verify-email?token={token}"
    first = full_name.split()[0] if full_name else "there"
    html = f"""
    <html><body style="font-family:system-ui,sans-serif;color:#1e293b;max-width:560px;margin:0 auto">
      <div style="background:#0f766e;padding:24px 32px;border-radius:12px 12px 0 0">
        <h1 style="color:white;margin:0;font-size:22px">HealthPredict</h1>
      </div>
      <div style="background:#f8fafc;padding:32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">
        <h2 style="margin:0 0 12px">Confirm Your New Email Address</h2>
        <p>Hello {first},</p>
        <p>We received a request to change your HealthPredict account email to this address.</p>
        <p style="margin:24px 0">
          <a href="{link}"
             style="background:#0f766e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
            Confirm Email Change
          </a>
        </p>
        <p style="color:#64748b;font-size:13px">If you did not request this change, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px">HealthPredict · For educational and wellness purposes only. Not a medical diagnosis.</p>
      </div>
    </body></html>
    """
    text = f"Hello {first},\n\nConfirm your new email address on HealthPredict:\n{link}"
    return send_email(to=to, subject="Confirm your new email address on HealthPredict", html_body=html, text_body=text)



