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

import { getClassDeclarationType } from '../compare-utils';
import { ComparerFactory } from '../comparer';

const classDeclarationAdded: ComparerFactory = (context) => ({
    compareClassDeclaration: (a, b) => {
        if (!a && b) {
            const type = getClassDeclarationType(b);
            context.report({
                key: `${type}-added`,
                message: `The ${type} "${b.getName()}" was added`,
                element: b
            });
        }
    }
});

const classDeclarationRemoved: ComparerFactory = (context) => ({
    compareClassDeclaration: (a, b) => {
        if (a && !b) {
            const type = getClassDeclarationType(a);
            context.report({
                key: `${type}-removed`,
                message: `The ${type} "${a.getName()}" was removed`,
                element: a
            });
        }
    }
});

export const classDeclarationComparerFactories = [classDeclarationAdded, classDeclarationRemoved];