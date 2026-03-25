export async function turnstileVerify({ secret, response, remoteip }) {
  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", response);

  if (remoteip) {
    formData.append("remoteip", remoteip);
  }

  const verifyResponse = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: formData
    }
  );

  if (!verifyResponse.ok) {
    return false;
  }

  const verifyData = await verifyResponse.json().catch(() => null);
  return Boolean(verifyData?.success);
}