# Security Standard

## Credentials

- Never commit service-role keys, API secrets, payment secrets, SMTP passwords, or private tokens.
- Browser code receives only explicitly public configuration.
- Development and production use separate projects and credentials.
- Rotate any credential that has been committed or shared unintentionally.

## Authentication and authorization

- Authentication proves identity; it does not grant administrative authority.
- Protect every private table with tested RLS policies.
- Verify administrator privileges at the data or server layer, not only by hiding navigation.
- Restrict authentication redirects to approved origins.
- Provide revocation, suspension, and sign-out behavior.

## Forms and data

- Validate in the browser for usability and again on the server for security.
- Minimize collected personal information.
- Rate-limit public forms and add bot protection where abuse is plausible.
- Escape untrusted text and prefer `textContent` over `innerHTML`.
- Define retention and deletion requirements before collecting sensitive information.

## Browser security

- Use HTTPS in production.
- Configure a Content Security Policy at the host where practical.
- Set security headers, including protections against framing and MIME sniffing.
- Avoid unnecessary third-party scripts.
- Review every external script and pin versions when possible.

## Administration

- Audit privileged changes.
- Require stronger verification for payouts, billing and role changes.
- Separate ordinary content editing from financial and security permissions.
- Back up production data and rehearse restoration.

