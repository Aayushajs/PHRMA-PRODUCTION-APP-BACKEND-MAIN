import path from "path";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

export interface StoreRequestInput {
  medicines: string[];
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
}

export interface StoreAvailabilityRow {
  storeId: string;
  storeName: string;
  medicineName: string;
  price: number;
  availability: boolean;
  distance: number;
}

export interface StoreAvailabilityResponse {
  stores: StoreAvailabilityRow[];
}

const PROTO_PATH = path.resolve(process.cwd(), "Utils", "lib", "proto", "store.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const grpcDefinition = grpc.loadPackageDefinition(packageDefinition) as any;
const StoreServiceClient = grpcDefinition.StoreService;

let client: typeof grpc.Client | null = null;

const getClient = (): any => {
  if (!client) {
    client = new StoreServiceClient("localhost:50051", grpc.credentials.createInsecure());
  }
  return client;
};

export const getStoreAvailability = (input: StoreRequestInput): Promise<StoreAvailabilityResponse> => {
  const grpcClient = getClient();

  return new Promise((resolve, reject) => {
    grpcClient.GetStoreAvailability(
      {
        medicines: input.medicines,
        latitude: input.latitude ?? 0,
        longitude: input.longitude ?? 0,
        radiusKm: input.radiusKm ?? 10,
      },
      (error: grpc.ServiceError | null, response: StoreAvailabilityResponse) => {
        if (error) {
          return reject(error);
        }
        resolve(response);
      },
    );
  });
};