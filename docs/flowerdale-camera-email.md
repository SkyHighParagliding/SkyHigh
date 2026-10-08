> **OBSOLETE (2026-10-08):** the club owns the Flowerdale cameras and is entitled to retrieve the images, so no permission email to the operator is needed. Kept for reference only. See `wiki/future/flowerdale-cameras-plan.md`.

# Flowerdale (Three Sisters) cameras — operator email

**Purpose:** Ask the camera operator (myairportcams.com / "Aus Web Cams") for an
image feed that works for Australian visitors, so the club website can show the
Flowerdale live cameras at their native ~10-minute cadence.

**Background:** myairportcams geo-blocks Australian IPs — AU visitors (our
members) are served a placeholder instead of the live frame, while non-AU/VPN
IPs get the real image. As a stopgap the website currently pulls the frames via
Ventusky's re-hosted copy, which only updates ~hourly. Getting an unrestricted
URL (or having our domains whitelisted) restores the 10-minute feed.

**To:** info@auswebcams.com
**Subject:** Flowerdale (Three Sisters) cameras — image feed for SkyHigh Paragliding Club website

---

Hi,

I'm from **SkyHigh Paragliding Club** in Victoria. The two cameras at
**Flowerdale / Three Sisters** ("Facing North" / "Facing South" on your
`myairportcams.com/Flowerdale/` page) overlook one of our main flying sites, and
we'd love to display their live images on our club website so members can check
conditions before heading up.

We've hit one snag and are hoping you can help. When we load the camera images
directly, **Australian IP addresses are served the grey "IMAGE UNAVAILABLE"
placeholder rather than the live frame** — i.e. exactly our members can't see
them. We confirmed this a few ways:

- `https://myairportcams.com/Flowerdale/capture/Camera1.jpg` and `Camera2.jpg`
  return the placeholder from Australian connections;
- `showimagecamera1.php` / `showimagecamera2.php` return HTTP 500 to us;
- the same URLs load the real image fine over a non-Australian VPN.

As a temporary workaround we're pulling the frames via Ventusky's re-hosted copy,
but that only updates about hourly, whereas your feed refreshes roughly every
10 minutes.

Would you be able to either:

1. **Provide a direct image URL** for each of the two Flowerdale cameras that
   isn't IP-restricted; or
2. **Whitelist our website** so the images load for our members — our domains are
   **skyhighparagliding.org.au** and **skyhigh-production.up.railway.app**?

We're very happy to credit "myairportcams.com / Aus Web Cams" with a link back
on the page.

Thanks very much for running these — they're a great resource for the local
flying community.

Kind regards,
Jon Pamment
SkyHigh Paragliding Club
