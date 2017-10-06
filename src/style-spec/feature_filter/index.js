// @flow

const {createExpression} = require('../expression');
const {BooleanType} = require('../expression/types');
const {typeOf} = require('../expression/values');

import type {GlobalProperties} from '../expression';
export type FeatureFilter = (globalProperties: GlobalProperties, feature: VectorTileFeature) => boolean;

module.exports = createFilter;

/**
 * Given a filter expressed as nested arrays, return a new function
 * that evaluates whether a given feature (with a .properties or .tags property)
 * passes its test.
 *
 * @private
 * @param {Array} filter mapbox gl filter
 * @returns {Function} filter-evaluating function
 */
function createFilter(filter: any): FeatureFilter {
    if (!filter) {
        return () => true;
    }

    const expression = Array.isArray(filter) ? convertFilter(filter) : filter.expression;
    const compiled = createExpression(expression, {
        context: 'filter',
        expectedType: BooleanType,
        defaultValue: false
    });

    if (compiled.result === 'success') {
        return compiled.evaluate;
    } else {
        throw new Error(compiled.errors.map(err => `${err.key}: ${err.message}`).join(', '));
    }
}

function convertFilter(filter: ?Array<any>): mixed {
    if (!filter) return true;
    const op = filter[0];
    if (filter.length <= 1) return (op !== 'any');
    const converted =
        op === '==' ? compileComparisonOp(filter[1], filter[2], '==') :
        op === '!=' ? compileNegation(compileComparisonOp(filter[1], filter[2], '==')) :
        op === '<' ||
        op === '>' ||
        op === '<=' ||
        op === '>=' ? compileComparisonOp(filter[1], filter[2], op) :
        op === 'any' ? compileDisjunctionOp(filter.slice(1)) :
        op === 'all' ? ['&&'].concat(filter.slice(1).map(convertFilter)) :
        op === 'none' ? ['&&'].concat(filter.slice(1).map(convertFilter).map(compileNegation)) :
        op === 'in' ? compileInOp(filter[1], filter.slice(2)) :
        op === '!in' ? compileNegation(compileInOp(filter[1], filter.slice(2))) :
        op === 'has' ? compileHasOp(filter[1]) :
        op === '!has' ? compileNegation(compileHasOp(filter[1])) :
        true;
    return converted;
}

function compileComparisonOp(property: string, value: any, op: string) {
    switch (property) {
        case '$type':
            return [`filter-type-${op}`, value];
        case '$id':
            return [`filter-id-${op}`, value];
        default:
            return [`filter-${op}`, property, value];
    }
}

function compileDisjunctionOp(filters: Array<Array<any>>) {
    return ['||'].concat(filters.map(convertFilter));
}

function compileInOp(property: string, values: Array<any>) {
    switch (property) {
        case '$type':
            return [`filter-type-in`, ['literal', values]];
        case '$id':
            return [`filter-id-in`, ['literal', values]];
        default:
            return [values.length > 200 ? `filter-in-large` : `filter-in-small`, property, ['literal', values]];
    }
}

function compileHasOp(property: string) {
    switch (property) {
        case '$type':
            return true;
        case '$id':
            return [`filter-has-id`];
        default:
            return [`filter-has`, property];
    }
}

function compileNegation(filter: mixed) {
    return ['!', filter];
}

