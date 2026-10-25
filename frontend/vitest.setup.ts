import { execFileSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

/** The schema as the server sends it, so the DSL tests run against the Python parser rather than a copy. */
export default function setup(project: TestProject) {
  const root = new URL('..', import.meta.url).pathname;
  const json = execFileSync('uv', ['run', '--project', root, 'python', '-c', 'import json; from dsl_crud.core import dsl; print(json.dumps(dsl.load_schema()))'], { cwd: root });
  project.provide('schema', JSON.parse(json.toString()));
}

declare module 'vitest' {
  export interface ProvidedContext {
    schema: import('./src/api/types').Schema;
  }
}
