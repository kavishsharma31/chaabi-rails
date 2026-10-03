import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgreementFixture = {
  agreement_id: string;
  property_id: string;
  tenant_signed: boolean;
  owner_signed: boolean;
  status:
    | "fully_signed"
    | "pending_tenant_signature"
    | "pending_owner_signature"
    | "unsigned";
  agreement_version: string;
  signing_reference: string | null;
  tenant_signed_at: string | null;
  owner_signed_at: string | null;
};

const AGREEMENTS: Record<string, AgreementFixture> = {
  "AGR-RIDGEWOOD-001": {
    agreement_id: "AGR-RIDGEWOOD-001",
    property_id: "PROP-RIDGEWOOD-001",
    tenant_signed: true,
    owner_signed: true,
    status: "fully_signed",
    agreement_version: "v1",
    signing_reference: "AGR-RIDGEWOOD-001-SIGNED-v1",
    tenant_signed_at: "2026-10-03T18:45:00+05:30",
    owner_signed_at: "2026-10-03T18:51:00+05:30",
  },

  "AGR-RIDGEWOOD-PENDING": {
    agreement_id: "AGR-RIDGEWOOD-PENDING",
    property_id: "PROP-RIDGEWOOD-001",
    tenant_signed: true,
    owner_signed: false,
    status: "pending_owner_signature",
    agreement_version: "v1",
    signing_reference: null,
    tenant_signed_at: "2026-10-03T18:45:00+05:30",
    owner_signed_at: null,
  },

  "AGR-RIDGEWOOD-UNSIGNED": {
    agreement_id: "AGR-RIDGEWOOD-UNSIGNED",
    property_id: "PROP-RIDGEWOOD-001",
    tenant_signed: false,
    owner_signed: false,
    status: "unsigned",
    agreement_version: "v1",
    signing_reference: null,
    tenant_signed_at: null,
    owner_signed_at: null,
  },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const agreementId = body?.agreement_id;

    if (!agreementId) {
      return NextResponse.json(
        {
          success: false,
          error: "agreement_id is required",
        },
        { status: 400 }
      );
    }

    const agreement = AGREEMENTS[agreementId];

    if (!agreement) {
      return NextResponse.json(
        {
          success: false,
          found: false,
          agreement_id: agreementId,
          error: "Agreement not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      found: true,
      source: "agreement_status_mock",
      ...agreement,
      release_eligible:
        agreement.tenant_signed &&
        agreement.owner_signed &&
        agreement.status === "fully_signed" &&
        Boolean(agreement.signing_reference),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected agreement-status error",
      },
      { status: 500 }
    );
  }
}