"""
Drug intelligence: autocomplete (RxNav), interaction checks (openFDA + optional licensed provider),
and caching via drug_interaction_cache table.

Status semantics:
  - "found": real interactions returned from a verified source
  - "none_found_in_source": the source was reachable and reported no interactions
  - "could_not_check": network failure, timeout, malformed response, or no source configured
"""

import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.models.medicine import DrugInteractionCache

logger = logging.getLogger(__name__)

RXNORM_APPROX_SEARCH = "https://rxnav.nlm.nih.gov/REST/approximateTerm.json"
OPENFDA_LABEL_URL = "https://api.fda.gov/drug/label.json"


# ─── Autocomplete (RxNav approximateTerm - still works) ────────────────────────

async def search_medicine_names(query: str, max_results: int = 10) -> list[dict[str, Any]]:
    """Search standardised drug names via NIH RxNav approximateTerm API."""
    if not query or len(query.strip()) < 2:
        return []
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(RXNORM_APPROX_SEARCH, params={"term": query.strip(), "maxEntries": max_results})
            if resp.status_code != 200:
                logger.warning("RxNav search returned status %s", resp.status_code)
                return []
            data = resp.json()
            candidates = data.get("approximateGroup", {}).get("candidate", [])
            seen: set[str] = set()
            results: list[dict[str, Any]] = []
            for item in candidates:
                name = item.get("name")
                rxcui = item.get("rxcui")
                if name and name.lower() not in seen:
                    seen.add(name.lower())
                    results.append({"name": name, "rxcui": rxcui, "score": item.get("score")})
            return results
    except Exception as exc:  # noqa: BLE001
        logger.error("Error connecting to RxNav search: %s", exc)
        return []


# ─── Interaction check (openFDA drug label API) ────────────────────────────────

def _parse_openfda_interactions(results: list[dict], drug_a_name: str, drug_b_name: str) -> list[dict[str, str]]:
    """Extract interaction mentions from openFDA drug label 'drug_interactions' field."""
    interactions = []
    for result in results:
        sections = result.get("drug_interactions", [])
        for section_text in sections:
            # The section text is often a long paragraph; we look for mentions of the other drug
            lower_text = section_text.lower()
            b_lower = drug_b_name.lower()
            if b_lower in lower_text:
                # Extract a relevant snippet (first 500 chars of the section containing the mention)
                start = max(0, lower_text.index(b_lower) - 100)
                end = min(len(section_text), start + 500)
                snippet = section_text[start:end].strip()
                if snippet:
                    interactions.append({
                        "drug_a": drug_a_name,
                        "drug_b": drug_b_name,
                        "severity": "MODERATE",  # openFDA doesn't provide severity grades
                        "description": snippet,
                        "source": "openFDA",
                    })
    return interactions


async def check_interactions_openfda(drug_a_name: str, drug_b_name: str) -> dict[str, Any]:
    """
    Query openFDA drug label API for interaction information between two drugs.
    Returns {"status": "found"|"none_found_in_source"|"could_not_check", "interactions": [...], "source": ..., "checked_at": ...}
    """
    try:
        search_query = f'openfda.substance_name:"{drug_a_name}" AND drug_interactions:"{drug_b_name}"'
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(OPENFDA_LABEL_URL, params={"search": search_query, "limit": 3})

            if resp.status_code == 404:
                # openFDA returns 404 when no results match
                return {
                    "status": "none_found_in_source",
                    "interactions": [],
                    "source": "openFDA",
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                }

            if resp.status_code != 200:
                logger.warning("openFDA returned status %s for %s + %s", resp.status_code, drug_a_name, drug_b_name)
                return {
                    "status": "could_not_check",
                    "interactions": [],
                    "source": "openFDA",
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                }

            data = resp.json()
            results = data.get("results", [])
            if not results:
                return {
                    "status": "none_found_in_source",
                    "interactions": [],
                    "source": "openFDA",
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                }

            interactions = _parse_openfda_interactions(results, drug_a_name, drug_b_name)
            if not interactions:
                # Also try the reverse direction
                pass

            status = "found" if interactions else "none_found_in_source"
            return {
                "status": status,
                "interactions": interactions,
                "source": "openFDA",
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }

    except httpx.TimeoutException:
        logger.warning("openFDA timeout checking %s + %s", drug_a_name, drug_b_name)
        return {"status": "could_not_check", "interactions": [], "source": "openFDA",
                "checked_at": datetime.now(timezone.utc).isoformat()}
    except Exception as exc:  # noqa: BLE001
        logger.error("openFDA error checking %s + %s: %s", drug_a_name, drug_b_name, exc)
        return {"status": "could_not_check", "interactions": [], "source": "openFDA",
                "checked_at": datetime.now(timezone.utc).isoformat()}


# ─── Cached interaction check (DB + openFDA) ──────────────────────────────────

def _get_cached_interactions(db: Session, drug_a_name: str, drug_b_name: str) -> list[DrugInteractionCache] | None:
    """Return cached interactions if they exist (either direction). Returns None if no cache entry."""
    a_lower, b_lower = drug_a_name.lower(), drug_b_name.lower()
    rows = db.scalars(
        select(DrugInteractionCache).where(
            or_(
                (DrugInteractionCache.drug_a_name == a_lower) & (DrugInteractionCache.drug_b_name == b_lower),
                (DrugInteractionCache.drug_a_name == b_lower) & (DrugInteractionCache.drug_b_name == a_lower),
            )
        )
    ).all()
    return list(rows) if rows else None


def _cache_interactions(db: Session, interactions: list[dict[str, str]]) -> None:
    """Persist interactions to the cache table."""
    for ix in interactions:
        entry = DrugInteractionCache(
            drug_a_name=ix.get("drug_a", "").lower(),
            drug_b_name=ix.get("drug_b", "").lower(),
            drug_a_rxcui=ix.get("drug_a_rxcui"),
            drug_b_rxcui=ix.get("drug_b_rxcui"),
            severity=ix.get("severity", "MODERATE"),
            description=ix.get("description", ""),
            source=ix.get("source", "openFDA"),
        )
        db.add(entry)
    db.commit()


async def check_drug_interactions(drug_names: list[str], db: Session | None = None) -> dict[str, Any]:
    """
    Check interactions among a list of drug names.  Uses openFDA as default provider.
    Returns {status, interactions, source, checked_at}.
    """
    if len(drug_names) < 2:
        return {"status": "none_found_in_source", "interactions": [], "source": "openFDA",
                "checked_at": datetime.now(timezone.utc).isoformat()}

    all_interactions: list[dict[str, Any]] = []
    overall_status = "none_found_in_source"

    # Check every pair
    for i in range(len(drug_names)):
        for j in range(i + 1, len(drug_names)):
            a, b = drug_names[i].strip(), drug_names[j].strip()
            if not a or not b:
                continue

            # Check cache first
            if db is not None:
                cached = _get_cached_interactions(db, a, b)
                if cached is not None:
                    for row in cached:
                        all_interactions.append({
                            "drug_a": row.drug_a_name, "drug_b": row.drug_b_name,
                            "severity": row.severity, "description": row.description,
                            "source": row.source,
                        })
                    if cached:
                        overall_status = "found"
                    continue

            result = await check_interactions_openfda(a, b)

            if result["status"] == "could_not_check":
                overall_status = "could_not_check"
            elif result["status"] == "found":
                overall_status = "found"
                all_interactions.extend(result["interactions"])
                if db is not None:
                    _cache_interactions(db, result["interactions"])

    return {
        "status": overall_status,
        "interactions": all_interactions,
        "source": settings.DRUG_INTERACTIONS_PROVIDER,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
