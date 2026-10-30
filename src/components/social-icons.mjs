import icon from 'astro-iconset';

// The brand marks SocialLinks.astro draws, bundled at build time the way
// EmDash's marketing template does. Discord's and GitHub's logos come from
// Simple Icons (@iconify-json/simple-icons, CC0-1.0), which takes them from
// each brand's own press kit; the marks stay their owners' trademarks. Every
// Astro config that renders Site.astro lists this integration.
export const socialIcons = () => icon({ include: { 'simple-icons': ['discord', 'github'] } });
