import { describe, expect, it } from 'vitest';
import type { GraphEdgePayload } from '@/api/types';
import { mergeRelationsIntoEdges } from './graph-edges';

const edge = (overrides: Partial<GraphEdgePayload> = {}): GraphEdgePayload => ({
  id: 'a__b', source: 'a', target: 'b', label: '', inline: true, depth: 1, direction: 'outgoing', ...overrides,
});

describe('graph inline edges', () => {
  it('renders inline relationships dashed and unlabeled', () => {
    const rendered = mergeRelationsIntoEdges([edge()], new Map())[0];
    expect(rendered.style).toMatchObject({ strokeDasharray: '5 4' });
    expect(rendered.data).toEqual({ relations: [edge()] });
  });

  it('does not merge mixed explicit and inline reciprocal relationships', () => {
    const relations = [edge(), edge({ id: 'b__a', source: 'b', target: 'a', label: 'knows', inline: false })];
    expect(mergeRelationsIntoEdges(relations, new Map())).toHaveLength(2);
  });

  it('merges same-kind reciprocal inline relationships', () => {
    const relations = [edge(), edge({ id: 'b__a', source: 'b', target: 'a' })];
    const rendered = mergeRelationsIntoEdges(relations, new Map());
    expect(rendered).toHaveLength(1);
    expect((rendered[0].data as { relations: GraphEdgePayload[] }).relations).toHaveLength(2);
  });
});
