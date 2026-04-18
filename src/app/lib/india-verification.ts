import axios from "axios";

export type IndiaVerificationStatus = "verified" | "pending" | "rejected";

export type IndiaVerificationInput = {
  governmentId: string;
  fullName: string;
  ngoName?: string;
  ngoWebsite?: string;
};

export type IndiaVerificationResult = {
  status: IndiaVerificationStatus;
  provider: string;
  providerReferenceId?: string;
  reason?: string;
  isVerified: boolean;
  raw?: unknown;
};

export type IndiaNgoVerificationInput = {
  ngoName: string;
  ngoWebsite: string;
  documentImage: string;
  contactName?: string;
};

const normalizeStatus = (value: unknown): IndiaVerificationStatus => {
  if (value === "verified" || value === "approved" || value === "success") {
    return "verified";
  }
  if (value === "rejected" || value === "failed" || value === "error") {
    return "rejected";
  }
  return "pending";
};

const isBackendUnavailableError = (error: any): boolean => {
  const statusCode = error?.response?.status;
  return statusCode === 404 || statusCode === 405 || statusCode === 500 || error?.code === "ERR_NETWORK";
};

const normalizePayloadResult = (payload: any, providerFallback: string): IndiaVerificationResult => {
  const status = normalizeStatus(payload?.status ?? payload?.result ?? payload?.verificationStatus);
  return {
    status,
    provider: payload?.provider || providerFallback,
    providerReferenceId:
      payload?.providerReferenceId ??
      payload?.referenceId ??
      payload?.reference_id ??
      payload?.transactionId ??
      payload?.requestId ??
      undefined,
    reason: payload?.reason ?? payload?.message ?? undefined,
    isVerified: payload?.isVerified === true || status === "verified",
    raw: payload?.raw ?? payload,
  };
};

const resolveVerificationProxyBaseUrl = () => {
  const configuredBaseUrl = ((import.meta as any).env?.VITE_VERIFICATION_PROXY_BASE_URL as string | undefined)?.trim();
  if (!configuredBaseUrl) {
    return "";
  }

  return configuredBaseUrl.replace(/\/$/, "");
};

const buildProxyUrl = (path: string) => {
  const baseUrl = resolveVerificationProxyBaseUrl();
  return `${baseUrl}${path}`;
};

// NOTE: Frontend API keys are visible in the browser. Move this call to a backend/Cloud Function for production.
export const verifyIndianGovernmentIdentity = async (
  input: IndiaVerificationInput
): Promise<IndiaVerificationResult> => {
  const provider = ((import.meta as any).env?.VITE_INDIA_VERIFICATION_PROVIDER as string | undefined)?.trim() || "mock";

  // Prefer secure backend proxy endpoint when available.
  try {
    const backendResponse = await axios.post(
      buildProxyUrl("/api/verify/identity"),
      {
        governmentId: input.governmentId.trim(),
        fullName: input.fullName.trim(),
        ngoName: input.ngoName?.trim() || "",
        ngoWebsite: input.ngoWebsite?.trim() || "",
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return normalizePayloadResult(backendResponse.data ?? {}, provider);
  } catch (error: any) {
    if (!isBackendUnavailableError(error)) {
      return {
        status: "pending",
        provider,
        reason: error?.response?.data?.reason || error?.response?.data?.message || error?.message || "Verification API failed",
        isVerified: false,
      };
    }
  }

  if (provider === "mock") {
    const isLikelyValid = input.governmentId.trim().length >= 8;
    return {
      status: isLikelyValid ? "verified" : "pending",
      provider: "mock-india-kyc",
      providerReferenceId: `MOCK-${Date.now()}`,
      reason: isLikelyValid ? "Mock verification passed" : "Mock verification requires review",
      isVerified: isLikelyValid,
      raw: {
        governmentIdLength: input.governmentId.trim().length,
      },
    };
  }

  const baseUrl = ((import.meta as any).env?.VITE_INDIA_VERIFICATION_BASE_URL as string | undefined)?.trim();
  const apiKey = ((import.meta as any).env?.VITE_INDIA_VERIFICATION_API_KEY as string | undefined)?.trim();

  if (!baseUrl || !apiKey) {
    return {
      status: "pending",
      provider,
      reason: "Verification provider is not configured.",
      isVerified: false,
    };
  }

  try {
    const response = await axios.post(
      `${baseUrl.replace(/\/$/, "")}/digilocker/verify`,
      {
        governmentId: input.governmentId.trim(),
        fullName: input.fullName.trim(),
        ngoName: input.ngoName?.trim() || "",
        ngoWebsite: input.ngoWebsite?.trim() || "",
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const payload = response.data ?? {};
    const status = normalizeStatus(payload?.status ?? payload?.result ?? payload?.verificationStatus);

    return {
      status,
      provider,
      providerReferenceId:
        payload?.referenceId ?? payload?.reference_id ?? payload?.transactionId ?? payload?.requestId ?? undefined,
      reason: payload?.message ?? payload?.reason ?? undefined,
      isVerified: status === "verified",
      raw: payload,
    };
  } catch (error: any) {
    return {
      status: "pending",
      provider,
      reason: error?.response?.data?.message || error?.message || "Verification API failed",
      isVerified: false,
    };
  }
};

// NOTE: Frontend API keys are visible in the browser. Move this call to a backend/Cloud Function for production.
export const verifyIndianNgoDocuments = async (
  input: IndiaNgoVerificationInput
): Promise<IndiaVerificationResult> => {
  const provider = ((import.meta as any).env?.VITE_INDIA_VERIFICATION_PROVIDER as string | undefined)?.trim() || "mock";

  // Prefer secure backend proxy endpoint when available.
  try {
    const backendResponse = await axios.post(
      buildProxyUrl("/api/verify/ngo"),
      {
        ngoName: input.ngoName.trim(),
        ngoWebsite: input.ngoWebsite.trim(),
        documentImage: input.documentImage,
        contactName: input.contactName?.trim() || "",
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return normalizePayloadResult(backendResponse.data ?? {}, provider);
  } catch (error: any) {
    if (!isBackendUnavailableError(error)) {
      return {
        status: "pending",
        provider,
        reason: error?.response?.data?.reason || error?.response?.data?.message || error?.message || "NGO verification API failed",
        isVerified: false,
      };
    }
  }

  if (provider === "mock") {
    const hasDocument = input.documentImage.startsWith("data:image/");
    const hasWebsite = input.ngoWebsite.trim().length > 0;
    const isLikelyValid = hasDocument && hasWebsite && input.ngoName.trim().length > 2;

    return {
      status: isLikelyValid ? "verified" : "pending",
      provider: "mock-india-ngo-kyc",
      providerReferenceId: `NGO-MOCK-${Date.now()}`,
      reason: isLikelyValid ? "Mock NGO document verification passed" : "Mock NGO documents need manual review",
      isVerified: isLikelyValid,
      raw: {
        hasDocument,
        ngoNameLength: input.ngoName.trim().length,
      },
    };
  }

  const baseUrl = ((import.meta as any).env?.VITE_INDIA_VERIFICATION_BASE_URL as string | undefined)?.trim();
  const apiKey = ((import.meta as any).env?.VITE_INDIA_VERIFICATION_API_KEY as string | undefined)?.trim();

  if (!baseUrl || !apiKey) {
    return {
      status: "pending",
      provider,
      reason: "Verification provider is not configured.",
      isVerified: false,
    };
  }

  try {
    const response = await axios.post(
      `${baseUrl.replace(/\/$/, "")}/ngo/verify`,
      {
        ngoName: input.ngoName.trim(),
        ngoWebsite: input.ngoWebsite.trim(),
        documentImage: input.documentImage,
        contactName: input.contactName?.trim() || "",
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const payload = response.data ?? {};
    const status = normalizeStatus(payload?.status ?? payload?.result ?? payload?.verificationStatus);

    return {
      status,
      provider,
      providerReferenceId:
        payload?.referenceId ?? payload?.reference_id ?? payload?.transactionId ?? payload?.requestId ?? undefined,
      reason: payload?.message ?? payload?.reason ?? undefined,
      isVerified: status === "verified",
      raw: payload,
    };
  } catch (error: any) {
    return {
      status: "pending",
      provider,
      reason: error?.response?.data?.message || error?.message || "NGO verification API failed",
      isVerified: false,
    };
  }
};
