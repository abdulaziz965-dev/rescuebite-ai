import axios from "axios";

const normalizeStatus = (value) => {
  if (value === "verified" || value === "approved" || value === "success") {
    return "verified";
  }
  if (value === "rejected" || value === "failed" || value === "error") {
    return "rejected";
  }
  return "pending";
};

const getProviderConfig = () => {
  const provider = (process.env.INDIA_VERIFICATION_PROVIDER || process.env.VITE_INDIA_VERIFICATION_PROVIDER || "mock").trim();
  const baseUrl = (process.env.INDIA_VERIFICATION_BASE_URL || process.env.VITE_INDIA_VERIFICATION_BASE_URL || "").trim();
  const apiKey = (process.env.INDIA_VERIFICATION_API_KEY || process.env.VITE_INDIA_VERIFICATION_API_KEY || "").trim();
  return { provider, baseUrl, apiKey };
};

const getDomainFromWebsite = (websiteUrl) => {
  try {
    const normalizedUrl = websiteUrl.startsWith("http://") || websiteUrl.startsWith("https://")
      ? websiteUrl
      : `https://${websiteUrl}`;
    const parsed = new URL(normalizedUrl);
    return parsed.hostname.toLowerCase();
  } catch {
    return "";
  }
};

const parseBody = (body) => {
  if (!body) {
    return {};
  }
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const input = parseBody(req.body);
  const ngoName = typeof input.ngoName === "string" ? input.ngoName.trim() : "";
  const ngoWebsite = typeof input.ngoWebsite === "string" ? input.ngoWebsite.trim() : "";
  const documentImage = typeof input.documentImage === "string" ? input.documentImage : "";
  const contactName = typeof input.contactName === "string" ? input.contactName.trim() : "";

  if (!ngoName || !ngoWebsite || !documentImage) {
    res.status(400).json({
      status: "pending",
      provider: "validation",
      isVerified: false,
      reason: "ngoName, ngoWebsite and documentImage are required.",
    });
    return;
  }

  const { provider, baseUrl, apiKey } = getProviderConfig();

  if (provider === "open-public") {
    const domain = getDomainFromWebsite(ngoWebsite);
    const hasDocument = documentImage.startsWith("data:image/");

    let domainResolves = false;
    let websiteReachable = false;

    if (domain) {
      try {
        const dnsResponse = await axios.get("https://dns.google/resolve", {
          params: {
            name: domain,
            type: "A",
          },
          timeout: 10000,
        });
        domainResolves = Array.isArray(dnsResponse?.data?.Answer) && dnsResponse.data.Answer.length > 0;
      } catch {
        domainResolves = false;
      }

      try {
        const normalizedUrl = ngoWebsite.startsWith("http://") || ngoWebsite.startsWith("https://")
          ? ngoWebsite
          : `https://${ngoWebsite}`;

        const websiteResponse = await axios.get(normalizedUrl, {
          timeout: 10000,
          maxRedirects: 5,
          validateStatus: () => true,
        });
        websiteReachable = websiteResponse.status >= 200 && websiteResponse.status < 400;
      } catch {
        websiteReachable = false;
      }
    }

    const score =
      (ngoName.length > 2 ? 20 : 0) +
      (hasDocument ? 20 : 0) +
      (domainResolves ? 30 : 0) +
      (websiteReachable ? 30 : 0);

    const isVerified = score >= 70;

    res.status(200).json({
      status: isVerified ? "verified" : "pending",
      provider: "open-public-checks",
      providerReferenceId: `OPEN-NGO-${Date.now()}`,
      reason: isVerified
        ? "No-partner checks passed (document + public DNS + reachable website)."
        : "No-partner checks need stronger proof (document/website/domain validation incomplete).",
      isVerified,
      raw: {
        ngoNameLength: ngoName.length,
        hasDocument,
        domain,
        domainResolves,
        websiteReachable,
        score,
        mode: "public-dns-and-website",
      },
    });
    return;
  }

  if (provider === "mock") {
    const hasDocument = documentImage.startsWith("data:image/");
    const isLikelyValid = hasDocument && ngoName.length > 2;
    res.status(200).json({
      status: isLikelyValid ? "verified" : "pending",
      provider: "mock-india-ngo-kyc",
      providerReferenceId: `NGO-MOCK-${Date.now()}`,
      reason: isLikelyValid ? "Mock NGO document verification passed" : "Mock NGO documents need manual review",
      isVerified: isLikelyValid,
      raw: { hasDocument, ngoNameLength: ngoName.length },
    });
    return;
  }

  if (!baseUrl || !apiKey) {
    res.status(200).json({
      status: "pending",
      provider,
      isVerified: false,
      reason: "Verification provider is not configured.",
    });
    return;
  }

  try {
    const response = await axios.post(
      `${baseUrl.replace(/\/$/, "")}/ngo/verify`,
      {
        ngoName,
        ngoWebsite,
        documentImage,
        contactName,
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

    res.status(200).json({
      status,
      provider,
      providerReferenceId:
        payload?.referenceId ?? payload?.reference_id ?? payload?.transactionId ?? payload?.requestId ?? undefined,
      reason: payload?.message ?? payload?.reason ?? undefined,
      isVerified: status === "verified",
      raw: payload,
    });
  } catch (error) {
    res.status(200).json({
      status: "pending",
      provider,
      isVerified: false,
      reason: error?.response?.data?.message || error?.message || "NGO verification API failed",
    });
  }
}
