import { describe, expect, inject, it } from 'vitest';
import type { Item } from '@/api/types';
import { draftItem } from '@/entities/item/draftItem';
import { defaultRoute, routeTree, withPublish, type RouteNode } from './published';

const item = (file: string, route: string | null): Item => ({ ...draftItem(file), file, route });
const shape = (nodes: RouteNode[]): unknown => nodes.map((n) => [n.route, n.items.map((i) => i.file), shape(n.children)]);

describe('routeTree', () => {
  it('nests routes by segment, a route both a page and a folder', () => {
    const tree = routeTree([item('e', 'essays/b'), item('i', 'index'), item('f', 'essays'), item('a', 'essays/a'), item('n', null)]);
    expect(shape(tree)).toEqual([
      ['essays', ['f'], [['essays/a', ['a'], []], ['essays/b', ['e'], []]]],
      ['index', ['i'], []],
    ]);
  });

  it('keeps every note at a route used twice', () => {
    expect(shape(routeTree([item('x', 'a/b'), item('y', 'a/b')]))).toEqual([['a', [], [['a/b', ['x', 'y'], []]]]]);
  });
});

describe('withPublish', () => {
  const schema = inject('schema');

  it('adds a block at the route from the file name', () => {
    expect(withPublish(schema, 'Heading\ntags x\n\n', 'a-cool-essay-a1b2c3.txt')).toBe('Heading\ntags x\npublish a-cool-essay\n');
  });

  it('leaves a note that has one, valid or not', () => {
    expect(withPublish(schema, 'H\npublish index\ntext', 'h.txt')).toBeNull();
    expect(withPublish(schema, 'H\npublish\ntext', 'h.txt')).toBeNull();
  });

  it('falls back for a name with nothing usable', () => {
    expect(defaultRoute('ÄÖ-0a1b2c.txt')).toBe('untitled');
  });
});
