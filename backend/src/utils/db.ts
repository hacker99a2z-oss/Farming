import { MongoClient, type Db } from "mongodb";

let clientPromise: Promise<MongoClient> | null = null;

export async function getDb(): Promise<Db> {
  const uri = process.env["MONGODB_URI"];
  if (!uri) throw new Error("Database is not configured yet");
  if (!clientPromise) {
    clientPromise = new MongoClient(uri, { maxPoolSize: 3, serverSelectionTimeoutMS: 8000 }).connect().catch((e) => {
      clientPromise = null;
      throw e;
    });
  }
  return (await clientPromise).db(process.env["MONGODB_DB"] ?? "farmcity");
}
