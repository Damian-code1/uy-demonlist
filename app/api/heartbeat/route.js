import { lastDataChange } from '../levels/route.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return Response.json({ lastChange: lastDataChange }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}