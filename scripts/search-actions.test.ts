import { getSearchTrailingActions } from '../src/renderer/utils/searchActions';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testEmptyQueryHasNoTrailingAction() {
  assert(getSearchTrailingActions('').length === 0, 'Expected no trailing search action for an empty query');
  assert(getSearchTrailingActions('   ').length === 0, 'Expected no trailing search action for whitespace only');
}

function testNonEmptyQueryHasExactlyOneTrailingAction() {
  assert(getSearchTrailingActions('invoice').length === 1, 'Expected exactly one trailing search action for a non-empty query');
}

function run() {
  testEmptyQueryHasNoTrailingAction();
  testNonEmptyQueryHasExactlyOneTrailingAction();
  console.log('search-actions tests passed');
}

run();
