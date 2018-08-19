import * as vscode from 'vscode';
import { getQueryUnderCursor, SoqlQuery } from '../commands/soql';

import { ANTLRInputStream, CommonTokenStream, Token, ParserRuleContext } from 'antlr4ts';
import { ParseTreeWalker } from 'antlr4ts/tree';
import { SoqlLexer } from './grammars/soql/SoqlLexer';
import * as SoqlParser from './grammars/soql/SoqlParser';
import { SoqlListener } from './grammars/soql/SoqlListener';
import { SFDX_DIR, TOOLS_DIR, SOBJECTS_DIR, STANDARDOBJECTS_DIR, CUSTOMOBJECTS_DIR, JSONS_DIR } from '../dx/generator/fauxClassGenerator';
import * as path from 'path';
import * as fs from 'fs-extra';
var jsonQuery = require('json-query');
const moment: any = require('moment');
var reverse = require('reverse-string');

const enum FieldContext {
    UNKNOWN,
    SELECT,
    WHERE,
    GROUPBY,
    ORDERBY,
    FROM
}

const enum SubQueryType {
    UNKNOWN, 
    CHILDRELATIONSHIP,
    SEMIJOIN
}

enum ConditionalOperator {
    NEQUAL   = '!=',
    NEQUAL2  = '<>', 
    LT       = '<',
    LTE      = '<=',
    GT       = '>',
    GTE      = '>=',
    EQUAL    = '=',
    NOTIN    = 'NOT IN',
    IN       = 'IN',
    INCLUDES = 'INCLUDES',
    EXCLUDES = 'EXCLUDES',
    LIKE     = 'LIKE'
}

enum DateLiterals {
    L90D = 'LAST_90_DAYS',
    LFQ  = 'LAST_FISCAL_QUARTER',
    LFY  = 'LAST_FISCAL_YEAR',
    LM   = 'LAST_MONTH',
    LND  = 'LAST_N_DAYS:n',
    LNFQ = 'LAST_N_FISCAL_QUARTERS:n',
    LNFY = 'LAST_N_FISCAL_YEARS:n',
    LNM  = 'LAST_N_MONTHS:n',
    LNQ  = 'LAST_N_QUARTERS:n',
    LNW  = 'LAST_N_WEEKS:n',
    LNY  = 'LAST_N_YEARS:n',
    LQ   = 'LAST_QUARTER',
    LW   = 'LAST_WEEK',
    LY   = 'LAST_YEAR',
    N90D = 'NEXT_90_DAYS',
    NFQ  = 'NEXT_FISCAL_QUARTER',
    NFY  = 'NEXT_FISCAL_YEAR',
    NM   = 'NEXT_MONTH',
    NND  = 'NEXT_N_DAYS:n',
    NNFQ = 'NEXT_N_FISCAL_QUARTERS:n',
    NNFY = 'NEXT_N_FISCAL_YEARS:n',
    NNM  = 'NEXT_N_MONTHS:n',
    NNQ  = 'NEXT_N_QUARTERS:n',
    NNW  = 'NEXT_N_WEEKS:n',
    NNY  = 'NEXT_N_YEARS:n',
    NQ   = 'NEXT_QUARTER',
    NW   = 'NEXT_WEEK',
    NY   = 'NEXT_YEAR',
    TFQ  = 'THIS_FISCAL_QUARTER',
    TFY  = 'THIS_FISCAL_YEAR',
    TM   = 'THIS_MONTH',
    TQ   = 'THIS_QUARTER',
    TW   = 'THIS_WEEK',
    TY   = 'THIS_YEAR',
    TOD  = 'TODAY',
    TOM  = 'TOMORROW',
    YES  = 'YESTERDAY'
}

// NICE TO HAVE: highlight offending piece of query on error
export default class SoqlCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
        var completions: vscode.CompletionItem[] = [];

        let query: SoqlQuery = getQueryUnderCursor(position);
        let relativePosition: vscode.Position = position.translate(-query.getStartLine() + 1);
                
        let pointRemoved: boolean = false;
        let commaSanitized: boolean = false;
        let isFakeField: boolean = false;
        
        let filterOperatorDefined = false;
        let targetOperator: string = null;

        // Input sanitization to allow SOQL Parser to properly build a tree from a (possibly) incomplete query statement
        maybeBalanceParentheses(query);

        commaSanitized = maybeRemoveComma(query, relativePosition);
        relativePosition = maybeRemoveExtraSpaces(query, relativePosition);
            
        ({relativePosition, pointRemoved} = maybeRemovePoint(query, relativePosition));

        ({filterOperatorDefined, targetOperator} = maybeCompleteFilter(query, relativePosition));
        
        commaSanitized = commaSanitized || maybeAddComma(query, relativePosition);

        ({relativePosition, isFakeField} = maybeAddFakeFields(query, relativePosition));

        var chars = new ANTLRInputStream(query.prettyPrint());
        var lexer = new SoqlLexer(chars);
        var tokens = new CommonTokenStream(lexer);
        var parser = new SoqlParser.SoqlParser(tokens);
        parser.buildParseTree = true;

        var tree = parser.soqlCodeUnit();
        var listener = new SoqlTreeListener(query.flattenPosition(relativePosition, true).translate(0, -1));
        ParseTreeWalker.DEFAULT.walk(listener, tree);

        vscode.window.forceCode.outputChannel.appendLine(listener.targetObject);
        vscode.window.forceCode.outputChannel.appendLine(listener.targetField);
        vscode.window.forceCode.outputChannel.appendLine(listener.targetFieldCtx.toString());

        if (filterOperatorDefined && targetOperator && listener.targetField && listener.targetObject) {
            completions.push(...getFilterCompletions(listener));
        } else if (listener.shouldCompleteField()) {
            completions.push(...getFieldCompletions(listener, pointRemoved, commaSanitized, isFakeField));
        } else if (listener.shouldCompleteSObject()) {
            completions.push(...getSObjectCompletions(listener.targetObject));
        } else if (listener.shouldCompleteChildRelationship()) {
            completions.push(...getChildRelationshipCompletions(listener.targetObject, listener.targetRelationshipObject));
        }

        return Promise.resolve(completions);
    }
}

function getFilterCompletions(listener: SoqlTreeListener): vscode.CompletionItem[] {
    let completions: vscode.CompletionItem[] = [];
    let fieldInfo = extractFromJson(listener.targetObject, `fields[name=${listener.targetField}]`);
    if (fieldInfo && fieldInfo.value) {
        if (fieldInfo.value.type === 'date' || fieldInfo.value.type === 'datetime') {
            completions.push(new vscode.CompletionItem(moment().format(fieldInfo.value.type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ss.SSSZ'), vscode.CompletionItemKind.Constant));
            (<any>Object).values(DateLiterals).forEach(element => {
                completions.push(new vscode.CompletionItem(element, vscode.CompletionItemKind.Constant));
            });
        } else if (fieldInfo.value.type === 'picklist') {
            fieldInfo.value.picklistValues.forEach(element => {
                completions.push(new vscode.CompletionItem('\'' + element.value + '\'', vscode.CompletionItemKind.Constant));
            });
        }
    }
    return completions;
}

function getFieldCompletions(listener: SoqlTreeListener, pointRemoved: boolean, commaSanitized: boolean, isFakeField: boolean): vscode.CompletionItem[] {
    let fieldTokens: string[] = listener.targetField.split('.');
    let sObjectName: string = listener.targetObject;
    let completions: vscode.CompletionItem[] = [];
    let additionalQueryFilter: string = '';

    switch (listener.targetFieldCtx) {
        case FieldContext.WHERE: {
            additionalQueryFilter = 'filterable = true';
            break;
        }
        case FieldContext.GROUPBY: {
            additionalQueryFilter = 'groupable = true';
            break;
        }
        case FieldContext.ORDERBY: {
            additionalQueryFilter = 'sortable = true';
            break;
        }
    }

    if (listener.subQueryType === SubQueryType.CHILDRELATIONSHIP && listener.targetRelationshipObject) {
        let query = `childRelationships[relationshipName=${listener.targetRelationshipObject}]`;
        let childRelationship = extractFromJson(sObjectName, query);
        if (childRelationship && childRelationship.value) {
            sObjectName = childRelationship.value.childSObject;
        }
    }
    
    if (!commaSanitized && !isFakeField) {
        for (var i = 0; i < fieldTokens.length; i++) {
            let targetField: string = fieldTokens[i];

            if (pointRemoved && targetField === listener.targetObjectAlias) {
                continue;
            }

            let query;
            let options: {} = {};

            if (i == fieldTokens.length - 1 && !pointRemoved) {
                if (additionalQueryFilter) {
                    additionalQueryFilter = ` & ${additionalQueryFilter}]`;
                }
                query = `fields[*name~/^${targetField}.*/i${additionalQueryFilter}`;
                options['allowRegexp'] = true;
            } else {
                query = `fields[relationshipName=${targetField}]`;
            }
            
            let results = extractFromJson(sObjectName, query, options);
            
            if (i == fieldTokens.length - 1 && !pointRemoved) {
                // we are at the last element, provide completions
                completions.push(...processFields(results));
            } else { 
                // we are jumping to another object through a lookup field on the current one (we assume that the field name is complete)
                sObjectName = processRelationship(results);
            }
        }
    } 
    
    if (pointRemoved || commaSanitized || isFakeField) {
        if (additionalQueryFilter) {
            additionalQueryFilter = `[${additionalQueryFilter}]`;
        }
        let results = extractFromJson(sObjectName, `fields${additionalQueryFilter}`);
        completions.push(...processFields(results));
    }

    return completions;
}

function getSObjectCompletions(targetObject?: string): vscode.CompletionItem[] {
    let completions: vscode.CompletionItem[] = [];
    getSObjectJsonList().forEach(checkIfPropose);
    getSObjectJsonList(true).forEach(checkIfPropose);

    return completions;

    function checkIfPropose(element: string) {
        if (!targetObject || targetObject === '<missing Identifier>' || element.match(new RegExp('^' + targetObject + '.*', 'i'))) {
            completions.push(new vscode.CompletionItem(element, vscode.CompletionItemKind.Class));
        }
    }
}

function getChildRelationshipCompletions(targetObject: string, targetRelationshipObject?: string): vscode.CompletionItem[] {
    let completions: vscode.CompletionItem[] = [];

    let query = targetRelationshipObject ? `childRelationships[*relationshipName~/^${targetRelationshipObject}.*/i]` : 'childRelationships';
    let options = targetRelationshipObject ? {allowRegexp: true} : {};

    let childRelationships = extractFromJson(targetObject, query, options);

    if (childRelationships && childRelationships.value) {
        childRelationships.value.forEach(element => {
            completions.push(new vscode.CompletionItem(element.relationshipName, vscode.CompletionItemKind.Class));
        });
    }

    return completions;
}

function getSObjectJsonList(listCustom?: boolean): string[] {
    let targetDir: string = path.join(
    vscode.workspace.workspaceFolders[0].uri.fsPath,
    SFDX_DIR,
    TOOLS_DIR,
    SOBJECTS_DIR,
    listCustom ? CUSTOMOBJECTS_DIR : STANDARDOBJECTS_DIR,
    JSONS_DIR);

    return fs.readdirSync(targetDir).map(f => {
        return f.substring(0, f.lastIndexOf('.json'));
    });
}

function extractFromJson(sObjectName: string, query: string, jsonQueryOptions?: {}): any {
    let options = { data: null };
    Object.assign(options, jsonQueryOptions);
    if (sObjectName !== 'SObject') {
        let targetJson = path.join(
            vscode.workspace.workspaceFolders[0].uri.fsPath,
            SFDX_DIR,
            TOOLS_DIR,
            SOBJECTS_DIR,
            isCustom(sObjectName) ? CUSTOMOBJECTS_DIR : STANDARDOBJECTS_DIR,
            JSONS_DIR,
            sObjectName + '.json'
        );

        options['data'] = fs.readJsonSync(targetJson);
    } else {
        options['data'] = { fields: [{ name: 'Id' }, { name: 'Name' }] };
    }
    return jsonQuery(query, options);
}

function processFields(results: any): vscode.CompletionItem[] {
    let completions: vscode.CompletionItem[] = [];
    if (results && results.value) {
        results.value.forEach(f => {
            completions.push(constructFieldCompletionItem(f, vscode.CompletionItemKind.Field));
            if (f.type === 'reference') {
                completions.push(constructFieldCompletionItem(f, vscode.CompletionItemKind.Module, 'relationshipName'));
            }
        });
    } 

    function constructFieldCompletionItem(f: any, kind: vscode.CompletionItemKind, labelField?: string) : vscode.CompletionItem {
        let c = new vscode.CompletionItem(labelField ? f[labelField] : f.name, kind);
        c.detail = f.type;
        c.documentation = f.label;

        return c;
    }

    return completions;
}

function processRelationship(results: any): string {
    if (results && results.value) {
        if (results.value.referenceTo) {
            if (results.value.referenceTo.length == 1) {
                return results.value.referenceTo[0];
            } else {
                return 'SObject'; // we don't infere the actual type, in this case we provide a couple of fields that are in common to all SObjects
            }
        } 
    }

    return null;
}

function isCustom(sObjectName: string): boolean {
    return sObjectName.endsWith('__c') || sObjectName.endsWith('__mdt') || sObjectName.endsWith('__e') || sObjectName.endsWith('__x') || sObjectName.endsWith('__b');
}

function maybeRemovePoint(query: SoqlQuery, position: vscode.Position): any {
    let maybeNewPosition = position;
    let removed = position.character && query.getLine(position).substring(position.character - 1, position.character) == '.';

    if (removed) {
        query.setLine(maybeNewPosition, replaceAt(query.getLine(maybeNewPosition), maybeNewPosition.character - 1, ''));
        maybeNewPosition = maybeNewPosition.translate(0, -1);
    }

    return {relativePosition: maybeNewPosition, pointRemoved: removed};
}

function maybeAddFakeFields(query: SoqlQuery, position: vscode.Position) {
    let indexes = getAllIndexesOfMatches(query.prettyPrint(), /(SELECT\s+FROM)/gi);
    let maybeNewPosition = position;
    let shouldIgnoreFieldInCompletion = false;

    indexes.forEach(element => {
        let index = element[0] + 7;
        let expandedPosition = query.expandPositiion(index);
        let startPosition = query.expandPositiion(element[0]);
        let endPosition = query.expandPositiion(element[1]);
        shouldIgnoreFieldInCompletion = shouldIgnoreFieldInCompletion || 
            (maybeNewPosition.isAfterOrEqual(startPosition) && maybeNewPosition.isBeforeOrEqual(endPosition));
        
        query.setLine(expandedPosition, splice(query.getLine(expandedPosition), expandedPosition.character, 0, 'A '));
        if (expandedPosition.isBefore(maybeNewPosition)) {
            maybeNewPosition = maybeNewPosition.translate(0, +2);
        }
    });
    
    return { relativePosition: maybeNewPosition, isFakeField: shouldIgnoreFieldInCompletion};
}

function isCursorInSelectStatement(query: SoqlQuery, position: vscode.Position): boolean {
    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);

    let boundaries = computeSubQueriesBoundaries(query, position);
    let index = subQueryIndex(boundaries, flattenedPosition);

    if (index >= 0) {
        flattenedQuery = flattenedQuery = boundaries[index][2];
        flattenedPosition = flattenedPosition.translate(0, -boundaries[index][0]);
    } else {
        let newFlattenedQuery = '';
        let newFlattenedPosition = flattenedPosition;
        for (let i: number = 0; i <= boundaries.length; i++) {
            newFlattenedQuery += flattenedQuery.substring(i ? boundaries[i - 1][1] + 1 : 0, i < boundaries.length ? boundaries[i][0] : undefined);
            if (i < boundaries.length && boundaries[i][1] <= flattenedPosition.character) {
                newFlattenedPosition = newFlattenedPosition.translate(0, boundaries[i][0] - boundaries[i][1] - 1);
            }
        }
        flattenedQuery = newFlattenedQuery;
        flattenedPosition = newFlattenedPosition;
    }

    let startMatch = /\b(SELECT)\b/i.exec(flattenedQuery);
    let endMatch = /\b(FROM)\b/i.exec(flattenedQuery);

    return startMatch && endMatch && flattenedPosition.character > startMatch.index && 
        flattenedPosition.character - 1 <= endMatch.index;
}

function isCursorInWhereStatement(query: SoqlQuery, position: vscode.Position): boolean {
    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);

    let boundaries = computeSubQueriesBoundaries(query, position);
    let index = subQueryIndex(boundaries, flattenedPosition);

    if (index >= 0) {
        flattenedQuery = flattenedQuery = boundaries[index][2];
        flattenedPosition = flattenedPosition.translate(0, -boundaries[index][0]);
    } else {
        let newFlattenedQuery = '';
        let newFlattenedPosition = flattenedPosition;
        for (let i: number = 0; i <= boundaries.length; i++) {
            newFlattenedQuery += flattenedQuery.substring(i ? boundaries[i - 1][1] + 1 : 0, i < boundaries.length ? boundaries[i][0] : undefined);
            if (i < boundaries.length && boundaries[i][1] <= flattenedPosition.character) {
                newFlattenedPosition = newFlattenedPosition.translate(0, boundaries[i][0] - boundaries[i][1] - 1);
            }
        }
        flattenedQuery = newFlattenedQuery;
        flattenedPosition = newFlattenedPosition;
    }
    
    let startMatch = /\b(WHERE)\b/i.exec(flattenedQuery);
    let endMatch = /\b(WITH|GROUP\sBY|ORDER\sBY|LIMIT|OFFSET|FOR)\b|$/i.exec(flattenedQuery);

    return startMatch && endMatch && flattenedPosition.character > startMatch.index && 
            flattenedPosition.character - 1 <= endMatch.index;
}

function maybeRemoveComma(query: SoqlQuery, position: vscode.Position): boolean {
    if (!isCursorInSelectStatement(query, position)) return false;

    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);

    let lastCommaPosition: number = flattenedQuery.substring(0, flattenedPosition.character).lastIndexOf(',') + 1;

    let querySubstrToEnd = flattenedQuery.substring(flattenedPosition.character);
    var match = querySubstrToEnd.match(/([\(a-z]\w+\.?)/i);

    let result = !flattenedQuery.substring(lastCommaPosition, flattenedPosition.character).trim().length && 
                    match && match.length && (match[0].toLocaleUpperCase() === 'FROM' || match[0].startsWith('('));

    if (result) {
        let expandedLastCommaPosition = query.expandPositiion(lastCommaPosition);
        let affectedLine = query.getLine(expandedLastCommaPosition);

        query.setLine(expandedLastCommaPosition, replaceAt(affectedLine, expandedLastCommaPosition.character - 1, ' '));        
    }

    return result;
}

function maybeCompleteFilter(query: SoqlQuery, position: vscode.Position): any {
    if (!isCursorInWhereStatement(query, position)) return false;

    let token = extractFilterToken(query, position);

    let completed = token.trim() === token;
    let filterOperatorDefined: boolean = false;
    let targetOperator: string = '';

    if (completed) {
        let affectedLine = query.getLine(position)
        if ((<any>Object).values(ConditionalOperator).includes(token)) {
            query.setLine(position, splice(affectedLine, position.character, 0, 'null'));
            filterOperatorDefined = true;
            targetOperator = token;
        } else {
            query.setLine(position, splice(affectedLine, position.character, 0, '=null'));
        }
    }

    return {filterOperatorDefined: filterOperatorDefined, targetOperator: targetOperator};
}

function extractFilterToken(query: SoqlQuery, position: vscode.Position) {
    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);
    
    let indexes = getAllIndexesOfMatches(flattenedQuery.substring(0, flattenedPosition.character), 
        /[a-z]\w*((\s*(=|!=|<>|<=?|>=?))|(\s+(INCLUDES|EXCLUDES|(NOT\s)?IN|LIKE)))?/gi);

    if (!indexes || !indexes.length) {
        return '';
    }

    let match = indexes[indexes.length - 1];
    let startIndex = -1;
    let endsWithOperator = false;
    (<any>Object).values(ConditionalOperator).forEach(element => {
        if (match[2].endsWith(element)) {
            startIndex = match[1] - element.length;
            endsWithOperator = true;
        }    
    });

    if (!endsWithOperator) {
        startIndex = match[0];
    }

    return flattenedQuery.substring(startIndex, match[1]);
}

function maybeAddComma(query: SoqlQuery, position: vscode.Position): boolean {
    if (!isCursorInSelectStatement(query, position)) return false;

    let flattenedQuery = query.prettyPrint();
    let flattenedPosition = query.flattenPosition(position, true);

    let querySubstrToEnd = flattenedQuery.substring(flattenedPosition.character);

    var match = querySubstrToEnd.match(/,|([a-z]\w+\.?)/i);
    let added = match && match.length && match[0] !== ',' && match[0].toLocaleUpperCase() !== 'FROM';

    if (added) {
        query.setLine(position, replaceAt(query.getLine(position), position.character, ','));
    }

    return added;
}

function maybeRemoveExtraSpaces(query: SoqlQuery, position: vscode.Position): vscode.Position {
    let flattenedQuery = query.prettyPrint(false);
    let flattenedPosition = query.flattenPosition(position, true);

    let matches = reverse(flattenedQuery.substring(0, flattenedPosition.character)).match(/(\s+)/);

    if (matches && matches.length && matches[0].length > 1) {
        position = position.translate(0, -matches[0].length + 1);
    }

    return position;
}

function replaceAt(str, index, replace): string {
    return str.substring(0, index) + replace + str.substring(index + 1);
}

function splice(str: string, idx: number, rem: number, newStr: string): string {
    return str.slice(0, idx) + newStr + str.slice(idx + Math.abs(rem));
}

function maybeBalanceParentheses(query: SoqlQuery) {
    let parBalance = parenthesesBalance(query.prettyPrint());
    if (parBalance['balance'] > 0) {
        let lastLine = query.getLastLine();
        query.setLastLine(replaceAt(lastLine, lastLine.lastIndexOf(';'), ')'.repeat(parBalance['balance']) + ';')); 
    }
}

function parenthesesBalance(str: string, breakOnBalance?: boolean, startIndex?: number, endIndex?: number): any {
    let balance: number = 0;
    let curIndex = startIndex ? startIndex : 0;

    let eIdx = endIndex ? endIndex : str.length;
    do {
        if (str.charAt(curIndex) == '(') { balance++; }
        else if (str.charAt(curIndex) == ')') { balance--; }
        curIndex++;
    } while ((!breakOnBalance || balance) && curIndex < eIdx);
    return { balance: balance, endIndex: curIndex - 1 };
}

function computeSubQueriesBoundaries(query: SoqlQuery, position: vscode.Position): any[] {
    let flattenedQuery = query.prettyPrint(false);
    let flattenedPosition = query.flattenPosition(position, true);

    let querySubStr = flattenedQuery.substring(0, flattenedPosition.character);

    let matches = getAllIndexesOfMatches(querySubStr, /(\(SELECT)/gi);

    let res: any[] = [];

    matches.forEach(element => {
        let endMatch = parenthesesBalance(flattenedQuery.substring(element[0]), true);
        if (!endMatch['balance']) {
            res.push([element[0], element[0] + endMatch['endIndex'], flattenedQuery.substr(element[0], endMatch['endIndex'] + 1)]);
        }
    });

    return res;
}

function subQueryIndex(boundaries: any[], position: vscode.Position): number {
    let res: number = -1;

    for (let i: number = 0; i < boundaries.length && res < 0; i++) {
        let element: [] = boundaries[i];
        if (position.character >= element[0] && position.character <= element[1]) {
            res = i;
        }
    }
    
    return res;
}

function getAllIndexesOfMatches(str: string, pattern: RegExp): any[] {
    if (!pattern.global)
        return [];

    let match, indexes = [];
    while (match = pattern.exec(str))
        indexes.push([match.index, match.index + match[0].length, match[0]]);

    return indexes;
}
class SoqlTreeListener implements SoqlListener {
    pos: vscode.Position;
    targetObject: string = null;
    targetObjectAlias: string = null;
    targetRelationshipObject: string = null;
    targetField: string = '';
    targetFieldCtx: FieldContext = FieldContext.UNKNOWN;
    subQueryType: SubQueryType = SubQueryType.UNKNOWN;
    aliasToFieldMap = {};

    constructor(position: vscode.Position) {
        this.pos = position;
    }

    visitTerminal = () => { };
    visitErrorNode = () => { };
    enterEveryRule = () => { };
    exitEveryRule = () => { };

    enterObjectType = (ctx: SoqlParser.ObjectTypeContext) => {
        let curCtx: ParserRuleContext = ctx;
        while (curCtx && !(curCtx instanceof SoqlParser.WhereSubqueryContext || 
            curCtx instanceof SoqlParser.SoqlStatementContext)) {
            curCtx = curCtx.parent;
        }

        if (curCtx && (curCtx instanceof SoqlParser.WhereSubqueryContext) && 
            this.isInRange(curCtx.start, curCtx.stop) ||
            (curCtx instanceof SoqlParser.SoqlStatementContext && !this.targetObject)) {
            if (ctx.childCount == 2) { // has alias?
                this.targetObject = ctx.children[0].text;
                this.targetObjectAlias = ctx.children[1].text;
            } else {
                this.targetObject = ctx.text;
            }

            if (curCtx instanceof SoqlParser.WhereSubqueryContext) {
                this.subQueryType = SubQueryType.SEMIJOIN;
            }
        }
    }

    enterRelationshipItem = (ctx: SoqlParser.RelationshipItemContext) => {
        let curCtx: ParserRuleContext = ctx;
        while (curCtx && !(curCtx instanceof SoqlParser.SubqueryContext)) {
            curCtx = curCtx.parent;
        }

        if (curCtx && (curCtx instanceof SoqlParser.SubqueryContext) && 
            this.isInRange(curCtx.start, curCtx.stop) && ctx.text !== '<missing Identifier>') {
            this.targetRelationshipObject = ctx.text;
        }
    }

    enterSelectStatement = (ctx: SoqlParser.SelectStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.SELECT;
        }
    }

    enterWhereStatement = (ctx: SoqlParser.WhereStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.WHERE;
        }
    }

    enterOrderByStatement = (ctx: SoqlParser.OrderByStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.ORDERBY;
        }
    }

    enterGroupByStatement = (ctx: SoqlParser.GroupByStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.GROUPBY;
        }
    }

    enterFromStatement = (ctx: SoqlParser.FromStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.FROM;
        }
    }
 
    enterFieldItem = (ctx: SoqlParser.FieldItemContext) => {
        if (ctx.childCount == 2) { // has alias?
            this.aliasToFieldMap[ctx.children[1].text] = ctx.children[0].text;
        }
    }

    enterFieldName = (ctx: SoqlParser.FieldNameContext) => {
        let curCtx: ParserRuleContext = ctx;

        while (curCtx && !(curCtx instanceof SoqlParser.ConditionExpressionContext)) {
            curCtx = curCtx.parent;
        }

        if (!curCtx) curCtx = ctx;

        if (this.isInRange(curCtx.start, curCtx.stop, true)) {
            this.targetField = ctx.text;
            if (ctx.parent instanceof SoqlParser.WhereSubqueryContext) {
                this.targetFieldCtx = FieldContext.SELECT;
            }
        }
    }

    enterSelectSubqueryStatement = (ctx: SoqlParser.SelectSubqueryStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.SELECT;
            this.subQueryType = SubQueryType.CHILDRELATIONSHIP;
        }
    }

    enterFromSubqueryStatement = (ctx: SoqlParser.FromSubqueryStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.FROM;
            this.subQueryType = SubQueryType.CHILDRELATIONSHIP;
        }
    }

    enterWhereFromSubqueryStatement = (ctx: SoqlParser.WhereFromSubqueryStatementContext) => {
        if (this.isInRange(ctx.start, ctx.stop, true)) {
            this.targetFieldCtx = FieldContext.FROM;
            this.subQueryType = SubQueryType.SEMIJOIN;
        }
    }

    private isInRange(start: Token, end: Token, oneExtraAtEnd?: boolean): boolean {
        return (this.pos.line > start.line && this.pos.line < end.line) || 
            (this.pos.line == start.line && this.pos.line != end.line && this.pos.character >= start.startIndex) ||
            (this.pos.line == end.line && this.pos.line != start.line && this.pos.character <= (oneExtraAtEnd ? end.stopIndex + 1 : end.stopIndex)) ||
            (this.pos.line == start.line && this.pos.line == end.line && this.pos.character >= start.startIndex && this.pos.character <= (oneExtraAtEnd ? end.stopIndex + 1 : end.stopIndex));
    }

    public shouldCompleteField(): boolean {
        return !!this.targetObject && this.targetFieldCtx && this.targetFieldCtx !== FieldContext.FROM;
    }

    public shouldCompleteSObject(): boolean {
        return this.targetFieldCtx === FieldContext.FROM && this.subQueryType !== SubQueryType.CHILDRELATIONSHIP;
    }

    public shouldCompleteChildRelationship(): boolean {
        return !!this.targetObject && this.targetFieldCtx === FieldContext.FROM && this.subQueryType === SubQueryType.CHILDRELATIONSHIP;
    }
}
