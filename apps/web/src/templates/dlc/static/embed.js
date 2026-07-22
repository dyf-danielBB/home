document.title = "DLC 空间 · 网址集";

function labelDlcLogo() {
  document.querySelectorAll('img[src$="/dlc-logo.svg"]').forEach((logo) => {
    logo.alt = "DLC 空间 Logo";
    logo.setAttribute("aria-label", "DLC 空间");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", labelDlcLogo, { once: true });
} else {
  labelDlcLogo();
}
