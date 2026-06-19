import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '../../../../lib/db.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/?auth=error', request.url));
  }

  try {
    const clientId     = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri  = `${process.env.NEXTAUTH_URL}/api/auth/callback/discord`;

    // Exchange code for token
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
      return NextResponse.redirect(new URL('/?auth=error', request.url));
    }

    const tokenData  = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Get user info from Discord
    const userRes  = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const discordUser = await userRes.json();

    if (!discordUser.id) {
      return NextResponse.redirect(new URL('/?auth=error', request.url));
    }

    // Upsert user in DB
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
        discordUser.email || null,
      ]
    );

    // Set session cookie (use discord_id as session token — simple approach)
    const cookieStore = cookies();
    cookieStore.set('uy_session', discordUser.id, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      maxAge:   60 * 60 * 24 * 30, // 30 days
      path:     '/',
      sameSite: 'lax',
    });

    return NextResponse.redirect(new URL('/?auth=success', request.url));
  } catch (error) {
    console.error('[OAuth callback] Error:', error);
    return NextResponse.redirect(new URL('/?auth=error', request.url));
  }
}
