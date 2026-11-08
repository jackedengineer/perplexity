// Vitest aliases `@electric-sql/pglite` to this module, so every test database runs
// the real migrations with the same pgvector extension Neon provides in production.
// The relative import below reaches the real package and is not affected by the alias.
import {PGlite as BasePGlite} from '../../node_modules/@electric-sql/pglite/dist/index.js';
import type {PGliteOptions} from '../../node_modules/@electric-sql/pglite/dist/index.js';
import {vector} from '@electric-sql/pglite-pgvector';

export * from '../../node_modules/@electric-sql/pglite/dist/index.js';

const withVector=(options:PGliteOptions={}):PGliteOptions=>({...options,extensions:{vector,...options.extensions}});

export class PGlite extends BasePGlite {
  constructor(dataDirOrOptions?:string|PGliteOptions,options?:PGliteOptions){
    if(typeof dataDirOrOptions==='string')super(dataDirOrOptions,withVector(options));
    else super(withVector(dataDirOrOptions));
  }
}
