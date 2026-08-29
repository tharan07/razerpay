import { NextResponse } from 'next/server';
import { getAnalyticsSummary } from '@/lib/dashboard/queries';
import { runRecoverySimulation } from '@/lib/dashboard/simulation-service';

export async function POST() {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const isSimulationEnabled = process.env.ENABLE_DEMO_SIMULATION === 'true';

    // Production Security Guard: Simulation is disabled in production unless explicitly enabled
    if (isProduction && !isSimulationEnabled) {
      return NextResponse.json(
        {
          error:
            'Simulation functionality is disabled in production environments to prevent generating non-production test state.',
        },
        { status: 403 }
      );
    }

    const simResult = await runRecoverySimulation();
    const updatedSummary = await getAnalyticsSummary();

    return NextResponse.json({
      status: 'ok',
      simulation: simResult,
      data: updatedSummary,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to run recovery simulation',
      },
      { status: 500 }
    );
  }
}
