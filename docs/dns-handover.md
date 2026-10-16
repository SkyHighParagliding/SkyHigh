# SkyHigh website domain and DNS: handover notes

Written 16 October 2026, after moving the domain's DNS to Cloudflare.
For whoever next needs to check or change the website address, email
records, or where the domain is registered.

No passwords are in this file. All logins are in the club password manager
(see wiki/07-credential-recovery.md).


## 1. The short version

- The website is https://skyhighparagliding.org.au and
  https://www.skyhighparagliding.org.au. Both work over HTTPS.
- The domain is REGISTERED at Vodien.
- The domain's DNS is HOSTED at Cloudflare.
- The website itself runs on Railway.
- Club email is Google Workspace (Gmail). Website emails are sent by Resend.


## 2. Where everything lives

| What | Where | Login |
|---|---|---|
| Domain registration (renewal, nameservers) | Vodien: https://manage.vodien.com | Vodien account (password manager). Vodien support: 1300 863 436, or live chat. |
| DNS records | Cloudflare: https://dash.cloudflare.com, domain skyhighparagliding.org.au, DNS > Records | web@skyhighparagliding.org.au |
| Website hosting | Railway: SkyHigh project > SkyHigh service > Settings > Networking | web@skyhighparagliding.org.au |
| Club email | Google Workspace admin: https://admin.google.com | web@skyhighparagliding.org.au |
| Old DNS (no longer used) | Google Cloud Console, project "Skyhigh DNS Service", Cloud DNS zone "skyhigh-zone" | web@skyhighparagliding.org.au |

The domain expires 8 January 2028. Auto-renew is on at Vodien.

Note: public lookup tools show the registrar as "Web Address Registration
Pty Ltd". That is the company behind Vodien and Crazy Domains. The domain
is NOT in a Crazy Domains account. It is in the Vodien account.


## 3. What was wrong

Typing skyhighparagliding.org.au (without www) gave a browser error
("can't reach this page" / ERR_CONNECTION_CLOSED). www worked fine.

Cause: the bare domain used Google Workspace's "redirect to www" feature.
That feature only works over plain HTTP, not HTTPS, and modern browsers
try HTTPS first. Google Cloud DNS, where the DNS was hosted, cannot point a
bare domain at Railway, so it could not be fixed there.


## 4. What we did (16 Oct 2026)

1. Railway: added skyhighparagliding.org.au as a second custom domain
   (port 8080), next to www.skyhighparagliding.org.au.
2. Cloudflare: added the domain (Free plan) and copied every DNS record
   across from Google Cloud DNS exactly, plus the new Railway records and
   a Gmail SPF record (see section 5).
3. Vodien: Vodien support changed the nameservers from the four Google ones
   (ns-cloud-a1 to a4.googledomains.com) to Cloudflare's:
       abdullah.ns.cloudflare.com
       dana.ns.cloudflare.com
4. Checked: both addresses load over HTTPS with a valid certificate,
   Gmail MX records are in place, Railway shows a green tick on both domains.


## 5. The DNS records (in Cloudflare)

All records are "DNS only" (grey cloud). Do NOT switch the website records
to "Proxied" (orange cloud) unless you also set Cloudflare SSL/TLS to
"Full (strict)", or the site may break.

| Name | Type | Value | Used for |
|---|---|---|---|
| @ (bare domain) | CNAME | ec6h5vtz.up.railway.app | Website |
| www | CNAME | 33bp9c73.up.railway.app | Website |
| _railway-verify | TXT | railway-verify=9660350820ee... | Railway proves we own the bare domain |
| _railway-verify.www | TXT | railway-verify=128b03c8fbf5... | Railway proves we own www |
| @ | MX | 1 aspmx.l.google.com | Club Gmail |
| @ | MX | 5 alt1.aspmx.l.google.com | Club Gmail |
| @ | MX | 5 alt2.aspmx.l.google.com | Club Gmail |
| @ | TXT | v=spf1 include:_spf.google.com ~all | Gmail SPF (NEW, added 16 Oct 2026) |
| _dmarc | TXT | v=DMARC1; p=none; | Email reporting policy |
| send | MX | 10 feedback-smtp.ap-northeast-1.amazonses.com | Resend (website emails) |
| send | TXT | v=spf1 include:amazonses.com ~all | Resend SPF |
| resend._domainkey | TXT | p=MIGfMA0... (long key) | Resend DKIM |
| google._domainkey | TXT | v=DKIM1; k=rsa; p=MIIBIjAN... (2048-bit key) | Gmail DKIM (NEW, added 16 Oct 2026) |

The full values are visible in Cloudflare. They are also in
wiki/06-deployment.md (Domain Management).

Ignore the "DNS Settings" tab at Vodien. It holds old records (an A record
to 103.11.189.189 and some CNAMEs) that do nothing while the nameservers
point at Cloudflare. Do not "fix" them.


## 6. How to check everything is working

- Open https://skyhighparagliding.org.au and https://www.skyhighparagliding.org.au.
  Both should load the site with a padlock.
- Railway > SkyHigh > Settings > Networking: both custom domains should
  show a green tick.
- Nameservers: https://www.whatsmydns.net, search skyhighparagliding.org.au,
  type NS. It should show abdullah and dana .ns.cloudflare.com.
- Email: send a test message to a club address from an outside account.


## 7. If something goes wrong (rollback)

To go back to exactly how it was before, ask Vodien to set the nameservers
back to:
    ns-cloud-a1.googledomains.com
    ns-cloud-a2.googledomains.com
    ns-cloud-a3.googledomains.com
    ns-cloud-a4.googledomains.com
The old Google Cloud DNS zone was left untouched for this purpose.
Rolling back brings back the original problem (the bare domain fails over HTTPS).


## 8. Still to do

- [x] Google Workspace naked-domain redirect: nothing to do. Its "Change redirect"
      dialog has no remove option, and the setting is inert now that the bare
      domain no longer points at Google's 216.239.x.21 servers. Leave it set to www.
- [x] Gmail DKIM: DONE 16 Oct 2026. Generated in Workspace admin > Apps > Google
      Workspace > Gmail > Authenticate email (2048-bit, selector "google"), added
      in Cloudflare as TXT google._domainkey, and authentication started. Status:
      "Authenticating email with DKIM".
- [ ] Around 23 October 2026, once everything has run cleanly for a week,
      delete the old Google Cloud DNS zone "skyhigh-zone"
      (project "Skyhigh DNS Service"). It costs a little each month.


## 9. More detail

- wiki/06-deployment.md, Domain Management section
- wiki/03-decisions-log.md, DECISION-018 (why Cloudflare)
