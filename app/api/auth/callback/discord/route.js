import { query } from '../../../../../lib/db.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/?auth=error`);
  }

  try {
    const clientId     = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri  = `${process.env.NEXTAUTH_URL}/api/auth/callback/discord`;

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      console.error('[OAuth] Token exchange failed:', await tokenRes.text());
      return Response.redirect(`${process.env.NEXTAUTH_URL}/?auth=error`);
    }

    const { access_token } = await tokenRes.json();

    const userRes     = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const discordUser = await userRes.json();

    if (!discordUser.id) {
      return Response.redirect(`${process.env.NEXTAUTH_URL}/?auth=error`);
    }

    await query(
      `INSERT INTO users (discord_id, discord_username, discord_display_name, discord_avatar, discord_email)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         discord_username     = VALUES(discord_username),
         discord_display_name = VALUES(discord_display_name),
         discord_avatar       = VALUES(discord_avatar),
         discord_email        = VALUES(discord_email),
         updated_at           = NOW()`,
      [
        discordUser.id,
        discordUser.username,
        discordUser.global_name || discordUser.username,
        discordUser.avatar || null,
        discordUser.email  || null,
      ]
    );

    return Response.redirect(`${process.env.NEXTAUTH_URL}/?auth=success&uid=${discordUser.id}`, 302);
  } catch (error) {
    console.error('[OAuth callback] Error:', error);
    return Response.redirect(`${process.env.NEXTAUTH_URL}/?auth=error`, 302);
  }
}