import { NextResponse } from 'next/server';
import { getAnalyticsSummary } from '@/lib/dashboard/queries';

export async function GET() {
  try {
    const summary = await getAnalyticsSummary();
    return NextResponse.json({
      status: 'ok',
      data: summary,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to compute recovery analytics',
      },
      { status: 500 }
    );
  }
}
