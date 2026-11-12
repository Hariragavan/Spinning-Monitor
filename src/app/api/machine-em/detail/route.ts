import { NextRequest, NextResponse } from 'next/server';
import { getSingleMachineEmDetail } from '@/lib/iot/iotEmService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date')?.trim();
    const machine = searchParams.get('machine')?.trim();
    const shift = searchParams.get('shift')?.trim() || '1';

    if (!date || !machine) {
      return NextResponse.json({ success: false, error: 'date and machine are required' }, { status: 400 });
    }

    const detail = await getSingleMachineEmDetail(date, machine, shift);
    return NextResponse.json({
      success: true,
      data: detail
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch EM details' },
      { status: 500 }
    );
  }
}

