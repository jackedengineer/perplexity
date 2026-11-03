// Offline transport boundary: never invokes a provider or records user data.
export async function POST(){return Response.json({error:{message:'The research provider is temporarily unavailable. Please try again later.'}},{status:503});}
