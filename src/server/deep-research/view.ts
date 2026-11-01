import type {PublicAnswer} from '@/server/answers/view';
export type PublicResearchReport={question:string;createdAt:string;sections:{title:string;markdown:string;answer:PublicAnswer}[]};
