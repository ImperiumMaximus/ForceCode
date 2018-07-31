/*
 * Copyright (c) 2017, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */


  import * as vscode from 'vscode';
  import { xhr, XHROptions, XHRResponse } from 'request-light/lib/main';
  import { CLIENT_ID } from '../constants';
  import constants from '../../models/constants';
  
  export interface SObject {
    actionOverrides: any[];
    activateable: boolean;
    childRelationships: ChildRelationship[];
    compactLayoutable: boolean;
    createable: boolean;
    custom: boolean;
    customSetting: boolean;
    deletable: boolean;
    deprecatedAndHidden: boolean;
    feedEnabled: boolean;
    fields: Field[];
    hasSubtypes: boolean;
    isSubtype: boolean;
    keyPrefix: string;
    label: string;
    labelPlural: string;
    layoutable: boolean;
    listviewable?: any;
    lookupLayoutable?: any;
    mergeable: boolean;
    mruEnabled: boolean;
    name: string;
    namedLayoutInfos: any[];
    networkScopeFieldName?: any;
    queryable: boolean;
    recordTypeInfos: RecordTypeInfo[];
    replicateable: boolean;
    retrieveable: boolean;
    searchLayoutable: boolean;
    searchable: boolean;
    supportedScopes: SupportedScope[];
    triggerable: boolean;
    undeletable: boolean;
    updateable: boolean;
    urls: Urls2;
  }
  
  export interface ChildRelationship {
    cascadeDelete: boolean;
    childSObject: string;
    deprecatedAndHidden: boolean;
    field: string;
    junctionIdListNames: any[];
    junctionReferenceTo: any[];
    relationshipName: string;
    restrictedDelete: boolean;
  }
  
  export interface Field {
    aggregatable: boolean;
    autoNumber: boolean;
    byteLength: number;
    calculated: boolean;
    calculatedFormula?: any;
    cascadeDelete: boolean;
    caseSensitive: boolean;
    compoundFieldName?: any;
    controllerName?: any;
    createable: boolean;
    custom: boolean;
    defaultValue?: boolean;
    defaultValueFormula?: any;
    defaultedOnCreate: boolean;
    dependentPicklist: boolean;
    deprecatedAndHidden: boolean;
    digits: number;
    displayLocationInDecimal: boolean;
    encrypted: boolean;
    externalId: boolean;
    extraTypeInfo?: any;
    filterable: boolean;
    filteredLookupInfo?: any;
    groupable: boolean;
    highScaleNumber: boolean;
    htmlFormatted: boolean;
    idLookup: boolean;
    inlineHelpText?: any;
    label: string;
    length: number;
    mask?: any;
    maskType?: any;
    name: string;
    nameField: boolean;
    namePointing: boolean;
    nillable: boolean;
    permissionable: boolean;
    picklistValues: any[];
    polymorphicForeignKey: boolean;
    precision: number;
    queryByDistance: boolean;
    referenceTargetField?: any;
    referenceTo: string[];
    relationshipName: string;
    relationshipOrder?: any;
    restrictedDelete: boolean;
    restrictedPicklist: boolean;
    scale: number;
    searchPrefilterable: boolean;
    soapType: string;
    sortable: boolean;
    type: string;
    unique: boolean;
    updateable: boolean;
    writeRequiresMasterRead: boolean;
  }
  
  export interface Urls {
    layout: string;
  }
  
  export interface RecordTypeInfo {
    active: boolean;
    available: boolean;
    defaultRecordTypeMapping: boolean;
    master: boolean;
    name: string;
    recordTypeId: string;
    urls: Urls;
  }
  
  export interface SupportedScope {
    label: string;
    name: string;
  }
  
  export interface Urls2 {
    compactLayouts: string;
    rowTemplate: string;
    approvalLayouts: string;
    uiDetailTemplate: string;
    uiEditTemplate: string;
    defaultValues: string;
    describe: string;
    uiNewRecord: string;
    quickActions: string;
    layouts: string;
    sobject: string;
  }
  
  export interface DescribeSObjectResult {
    result: SObject;
  }
  
  export enum SObjectCategory {
    ALL = 'ALL',
    STANDARD = 'STANDARD',
    CUSTOM = 'CUSTOM'
  }
  
  type SubRequest = { method: string; url: string };
  type BatchRequest = { batchRequests: SubRequest[] };
  
  type SubResponse = { statusCode: number; result: SObject };
  
  type BatchResponse = { hasErrors: boolean; results: SubResponse[] };
  
  export class SObjectDescribe {
    public async describeGlobal(
      type: SObjectCategory,
      username?: string
    ): Promise<string[]> {
      vscode.window.forceCode.outputChannel.appendLine('Getting descriptions for all objects...');
    
      let result: string[];
      try {
        let allResults = await vscode.window.forceCode.conn.soap._invoke('describeGlobal', {});
        if (type === SObjectCategory.ALL) {
            result = allResults.sobjects;
        } else if (type === SObjectCategory.CUSTOM) {
            result = allResults.sobjects.filter(sobject => {
                return sobject.custom == 'true';
            });
        } else if (type === SObjectCategory.STANDARD) {
            result = allResults.sobjects.filter(sobject => {
                return sobject.custom == 'false';
            });
        }
        return Promise.resolve(result);
      } catch (e) {
        return Promise.reject(e);
      }
    }
  
    public async describeSObjectBatch(
      sobjects: any[],
      startIndex: number,
    ): Promise<SObject[]> {
      const batchSize = 25;
      
      var schema = {
        actionOverrides: [],
        activateable: 'boolean',
        childRelationships: [{
            cascadeDelete: 'boolean',
            childSObject: 'string',
            deprecatedAndHidden: 'boolean',
            field: 'string',
            junctionIdListNames: [],
            junctionReferenceTo: [],
            relationshipName: 'string',
            restrictedDelete: 'boolean',
        }],
        compactLayoutable: 'boolean',
        createable: 'boolean',
        custom: 'boolean',
        customSetting: 'boolean',
        deletable: 'boolean',
        deprecatedAndHidden: 'boolean',
        feedEnabled: 'boolean',
        fields: [{
            aggregatable: 'boolean',
            autoNumber: 'boolean',
            byteLength: 'number',
            calculated: 'boolean',
            cascadeDelete: 'boolean',
            caseSensitive: 'boolean',
            controllerName: 'string',
            createable: 'boolean',
            custom: 'boolean',
            defaultValue: 'boolean',
            defaultValueFormula: 'string',
            defaultedOnCreate: 'boolean',
            dependentPicklist: 'boolean',
            deprecatedAndHidden: 'boolean',
            digits: 'number',
            displayLocationInDecimal: 'boolean',
            encrypted: 'boolean',
            externalId: 'boolean',
            extraTypeInfo: 'string',
            filterable: 'boolean',
            filteredLookupInfo: 'Object',
            groupable: 'boolean',
            highScaleNumber: 'boolean',
            htmlFormatted: 'boolean',
            idLookup: 'boolean',
            inlineHelpText: 'Object',
            label: 'string',
            length: 'number',
            mask: 'Object',
            maskType: 'Object',
            name: 'string',
            nameField: 'boolean',
            namePointing: 'boolean',
            nillable: 'boolean',
            permissionable: 'boolean',
            picklistValues: [],
            polymorphicForeignKey: 'boolean',
            precision: 'number',
            queryByDistance: 'boolean',
            referenceTargetField: 'string',
            referenceTo: ['string'],
            relationshipName: 'string',
            relationshipOrder: 'number',
            restrictedDelete: 'boolean',
            restrictedPicklist: 'boolean',
            scale: 'number',
            searchPrefilterable: 'boolean',
            soapType: 'string',
            sortable: 'boolean',
            type: 'string',
            unique: 'boolean',
            updateable: 'boolean',
            writeRequiresMasterRead: 'boolean',
        }],
        hasSubtypes: 'boolean',
        isSubtype: 'boolea',
        keyPrefix: 'string',
        label: 'string',
        labelPlural: 'string',
        layoutable: 'boolean',
        listviewable: 'any',
        lookupLayoutable: 'any',
        mergeable: 'boolean',
        mruEnabled: 'boolean',
        name: 'string',
        namedLayoutInfos: [],
        networkScopeFieldName: 'string',
        queryable: 'boolean',
        recordTypeInfos: [{
            active: 'boolean',
            available: 'boolean',
            defaultRecordTypeMapping: 'boolean',
            master: 'boolean',
            name: 'string',
            recordTypeId: 'string',
            urls: {
                layout: 'string'
            }
        }],
        replicateable: 'boolean',
        retrieveable: 'boolean',
        searchLayoutable: 'boolean',
        searchable: 'boolean',
        supportedScopes: [{
            label: 'string',
            name: 'string'
        }],
        triggerable: 'boolean',
        undeletable: 'boolean',
        updateable: 'boolean',
        urls: {
            compactLayouts: 'string',
            rowTemplate: 'string',
            approvalLayouts: 'string',
            uiDetailTemplate: 'string',
            uiEditTemplate: 'string',
            defaultValues: 'string',
            describe: 'string',
            uiNewRecord: 'string',
            quickActions: 'string',
            layouts: 'string',
            sobject: 'string'
        }
    }

      try {
        const fetchedObjects: SObject[] = []
        var sObjectsBatch = sobjects.slice(startIndex, startIndex + batchSize).map(sobject => sobject.name);
        
        var result = await vscode.window.forceCode.conn.soap._invoke('describeSObjects', { names: sObjectsBatch }, [ schema ]);
        fetchedObjects.push(...result);
        return Promise.resolve(fetchedObjects);
      } catch (error) {
        return Promise.reject(error);
      }
    }
  }
  