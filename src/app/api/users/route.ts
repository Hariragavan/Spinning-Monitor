import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { User } from '@/types';

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const shed = searchParams.get('shed');

    const filter: any = {};
    if (shed && shed !== 'All') {
      filter.$or = [{ shed }, { shed: 'All' }, { role: 'ADMIN' }];
    }

    const users = await db.collection<User>('users').find(filter, { projection: { _id: 0, password: 0 } }).toArray();
    return NextResponse.json({ success: true, data: users });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();

    if (body.action === 'batch') {
      const users: User[] = body.users || [];
      await db.collection('users').deleteMany({});
      if (users.length > 0) {
        await db.collection('users').insertMany(users);
      }
      return NextResponse.json({ success: true, count: users.length });
    }

    const user: User = body.user || body;
    if (!user || (!user.userId && !user.username)) {
      return NextResponse.json({ success: false, error: 'userId or username is required' }, { status: 400 });
    }

    const key = user.userId ? { userId: user.userId } : { username: user.username };
    await db.collection('users').updateOne(
      key,
      { $set: user },
      { upsert: true }
    );

    return NextResponse.json({ success: true, data: user });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save user' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const username = searchParams.get('username');

    if (userId) {
      await db.collection('users').deleteOne({ userId });
      return NextResponse.json({ success: true, message: `User ${userId} deleted` });
    }
    if (username) {
      await db.collection('users').deleteOne({ username });
      return NextResponse.json({ success: true, message: `User ${username} deleted` });
    }

    return NextResponse.json({ success: false, error: 'userId or username is required' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to delete user' }, { status: 500 });
  }
}

