from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_pg_session
from models import MasterUser
from schemas import OrgAdminUpdate, OrgCreate, OrgResponse, OrgUpdate
from security import get_current_user, hash_password

router = APIRouter()

_ORG_SELECT = """
    SELECT organization_id, organization_name, admin_email,
           organization_size, business_domain, subscription_status,
           is_deleted, created_at
    FROM organizations
"""


def _row_to_dict(row) -> dict:
    return {
        "organization_id": row.organization_id,
        "organization_name": row.organization_name,
        "admin_email": row.admin_email,
        "organization_size": row.organization_size,
        "business_domain": row.business_domain,
        "subscription_status": row.subscription_status,
        "is_deleted": row.is_deleted,
        "created_at": row.created_at,
    }


@router.get("", response_model=list[OrgResponse])
def list_organizations(
    _: MasterUser = Depends(get_current_user),
    session: Session = Depends(get_pg_session),
):
    result = session.execute(text(f"{_ORG_SELECT} ORDER BY created_at DESC"))
    return [_row_to_dict(r) for r in result.fetchall()]


@router.post("", response_model=OrgResponse, status_code=status.HTTP_201_CREATED)
def create_organization(
    body: OrgCreate,
    _: MasterUser = Depends(get_current_user),
    session: Session = Depends(get_pg_session),
):
    existing = session.execute(
        text("SELECT 1 FROM organizations WHERE admin_email = :email"),
        {"email": body.admin_email},
    )
    if existing.fetchone():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An organization with this admin email already exists")

    hashed = hash_password(body.admin_password)
    result = session.execute(
        text("""
            INSERT INTO organizations
                (organization_name, admin_email, admin_password_hash,
                 organization_size, business_domain, subscription_status,
                 settings, is_deleted)
            VALUES
                (:name, :email, :pw_hash, :size, :domain, 'active', '{}', false)
            RETURNING organization_id, organization_name, admin_email,
                      organization_size, business_domain, subscription_status,
                      is_deleted, created_at
        """),
        {
            "name": body.organization_name,
            "email": body.admin_email,
            "pw_hash": hashed,
            "size": body.organization_size,
            "domain": body.business_domain,
        },
    )
    session.commit()
    return _row_to_dict(result.fetchone())


@router.put("/{org_id}", response_model=OrgResponse)
def update_organization(
    org_id: UUID,
    body: OrgUpdate,
    _: MasterUser = Depends(get_current_user),
    session: Session = Depends(get_pg_session),
):
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["org_id"] = str(org_id)

    result = session.execute(
        text(f"""
            UPDATE organizations SET {set_clauses}
            WHERE organization_id = :org_id
            RETURNING organization_id, organization_name, admin_email,
                      organization_size, business_domain, subscription_status,
                      is_deleted, created_at
        """),
        updates,
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    session.commit()
    return _row_to_dict(row)


@router.post("/{org_id}/archive", response_model=OrgResponse)
def archive_organization(
    org_id: UUID,
    _: MasterUser = Depends(get_current_user),
    session: Session = Depends(get_pg_session),
):
    result = session.execute(
        text("""
            UPDATE organizations SET is_deleted = true
            WHERE organization_id = :org_id
            RETURNING organization_id, organization_name, admin_email,
                      organization_size, business_domain, subscription_status,
                      is_deleted, created_at
        """),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    session.commit()
    return _row_to_dict(row)


@router.post("/{org_id}/restore", response_model=OrgResponse)
def restore_organization(
    org_id: UUID,
    _: MasterUser = Depends(get_current_user),
    session: Session = Depends(get_pg_session),
):
    result = session.execute(
        text("""
            UPDATE organizations SET is_deleted = false, subscription_status = 'active'
            WHERE organization_id = :org_id
            RETURNING organization_id, organization_name, admin_email,
                      organization_size, business_domain, subscription_status,
                      is_deleted, created_at
        """),
        {"org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    session.commit()
    return _row_to_dict(row)


@router.post("/{org_id}/admin", response_model=OrgResponse)
def assign_org_admin(
    org_id: UUID,
    body: OrgAdminUpdate,
    _: MasterUser = Depends(get_current_user),
    session: Session = Depends(get_pg_session),
):
    existing = session.execute(
        text("SELECT 1 FROM organizations WHERE admin_email = :email AND organization_id != :org_id"),
        {"email": body.admin_email, "org_id": str(org_id)},
    )
    if existing.fetchone():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This email is already used by another organization")

    hashed = hash_password(body.admin_password)
    result = session.execute(
        text("""
            UPDATE organizations
            SET admin_email = :email, admin_password_hash = :pw_hash
            WHERE organization_id = :org_id
            RETURNING organization_id, organization_name, admin_email,
                      organization_size, business_domain, subscription_status,
                      is_deleted, created_at
        """),
        {"email": body.admin_email, "pw_hash": hashed, "org_id": str(org_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    session.commit()
    return _row_to_dict(row)
