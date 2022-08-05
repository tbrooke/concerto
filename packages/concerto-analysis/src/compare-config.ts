/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ComparerFactory } from './comparer';
import { comparerFactories } from './comparers';

export enum CompareResult {
    NONE,
    PATCH,
    MINOR,
    MAJOR,
    ERROR,
}

export function compareResultToString(result: CompareResult) {
    switch (result) {
    case CompareResult.NONE:
        return 'none';
    case CompareResult.PATCH:
        return 'patch';
    case CompareResult.MINOR:
        return 'minor';
    case CompareResult.MAJOR:
        return 'major';
    case CompareResult.ERROR:
        return 'error';
    }
}

export type CompareConfig = {
    comparerFactories: ComparerFactory[];
    rules: Record<string, CompareResult>;
}

export const defaultCompareConfig: CompareConfig = {
    comparerFactories,
    rules: {
        'asset-added': CompareResult.MINOR,
        'asset-removed': CompareResult.MAJOR,
        'concept-added': CompareResult.MINOR,
        'concept-removed': CompareResult.MAJOR,
        'enum-added': CompareResult.MINOR,
        'enum-removed': CompareResult.MAJOR,
        'event-added': CompareResult.MINOR,
        'event-removed': CompareResult.MAJOR,
        'participant-added': CompareResult.MINOR,
        'participant-removed': CompareResult.MAJOR,
        'transaction-added': CompareResult.MINOR,
        'transaction-removed': CompareResult.MAJOR,
        'required-field-added': CompareResult.MAJOR,
        'optional-field-added': CompareResult.PATCH,
        'field-removed': CompareResult.MAJOR,
        'namespace-changed': CompareResult.ERROR
    }
};