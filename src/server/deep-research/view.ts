import type {PublicAnswer} from '@/server/answers/view';
export type PublicResearchReport={consensus?:import('zod').infer<typeof import('./consensus-contracts').consensusMetadata>;question:string;createdAt:string;sections:{title:string;markdown:string;answer:PublicAnswer}[]};
