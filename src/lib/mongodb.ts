import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spinning_monitor';
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

/**
 * Returns database instance for Spinning Monitor operations (spinning_monitor)
 */
export async function getDb(): Promise<Db> {
  const connectedClient = await clientPromise;
  return connectedClient.db();
}

/**
 * Returns database instance for IoT telemetry (iot_machine - exact same database used by Scm-iot)
 */
export async function getIotDb(): Promise<Db> {
  const connectedClient = await clientPromise;
  const dbName = process.env.IOT_DB_NAME || 'spinning_monitor';
  return connectedClient.db(dbName);
}

export default clientPromise;
