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

'use strict';

const TypedStack = require('@accordproject/concerto-util').TypedStack;
const ModelManager = require('../../lib/modelmanager');
const Factory = require('../../lib/factory');
const TypeNotFoundException = require('../../lib/typenotfoundexception');
const ResourceValidator = require('../../lib/serializer/resourcevalidator');
const Identifiable = require('../../lib/model/identifiable');
const Field = require('../../lib/introspect/field');
const Resource = require('../../lib/model/resource');
const ModelUtil = require('../../lib/modelutil');
const ClassDeclaration = require('../../lib/introspect/classdeclaration');
const Util = require('../composer/composermodelutility');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);

const sinon = require('sinon');
const chai = require('chai');
chai.should();
chai.use(require('chai-things'));

describe('ResourceValidator', function () {

    let modelManager;
    let resourceValidator;
    let factory;

    let sandbox;

    const enumModelString = `namespace org.acme.enumerations
    enum AnimalType {
      o SHEEP_GOAT
      o CATTLE
      o PIG
      o DEER_OTHER
    }`;

    const levelOneModel = `namespace org.acme.l1
    enum VehicleType {
      o CAR
      o TRUCK
      o SUV
      o MOTORBIKE
    }
    asset Base identified by id  {
      o String id
    }
    participant Person identified by ssn {
      o String ssn
    }
    participant Employee extends Person {
    }
    concept Data {
        o String name
    }
    `;

    const levelTwoModel = `namespace org.acme.l2
    import org.acme.l1.Base
    import org.acme.l1.Person
    asset Vehicle extends Base  {
      o Integer numberOfWheels
      o Double milage
    }
    participant PrivateOwner extends Person {
      o String employeeId
    }
    `;

    const levelThreeModel = `namespace org.acme.l3
    import org.acme.l2.Vehicle
    import org.acme.l1.VehicleType
    import org.acme.l1.Person
    concept TestConcept {
      o String name
    }
    asset Car extends Vehicle  {
      o String model
      o String[] serviceHistory optional
      o VehicleType[] vehicleTypes optional
      --> Person owner optional
      --> Person[] owners optional
      o Person[] containment optional
      o Person singlePerson optional
    }`;

    const abstractLevelThreeModel = `namespace org.acme.l3
    import org.acme.l2.Vehicle
    abstract asset Car extends Vehicle  {
      o String model
    }`;

    before(function () {
        sandbox = sinon.createSandbox();
        resourceValidator = new ResourceValidator();
        modelManager = new ModelManager();
        Util.addComposerModel(modelManager);
        factory = new Factory(modelManager);
    });

    beforeEach(function () {
        modelManager.addCTOModel(enumModelString);
        modelManager.addCTOModel(levelOneModel);
        modelManager.addCTOModel(levelTwoModel);
        modelManager.addCTOModel(levelThreeModel);
    });

    afterEach(function () {
        modelManager.clearModelFiles();
        sandbox.restore();
    });

    describe('#visit', () => {
        it('should do nothing if unknown object given', () => {
            const parameters = {
                stack: new TypedStack({})
            };

            const thing = {
                toString: () => {
                    return 'testing';
                }
            };
            sandbox.stub(resourceValidator, 'visitEnumDeclaration');
            sandbox.stub(resourceValidator, 'visitClassDeclaration');
            sandbox.stub(resourceValidator, 'visitRelationshipDeclaration');
            sandbox.stub(resourceValidator, 'visitField');

            resourceValidator.visit(thing, parameters);

            sinon.assert.notCalled(resourceValidator.visitEnumDeclaration);
            sinon.assert.notCalled(resourceValidator.visitClassDeclaration);
            sinon.assert.notCalled(resourceValidator.visitRelationshipDeclaration);
            sinon.assert.notCalled(resourceValidator.visitField);

        });
    });

    describe('#visitRelationshipDeclaration', function() {
        it('should detect assigning a resource to a relationship', function () {
            const employee = factory.newResource('org.acme.l1', 'Employee', 'DAN');
            const typedStack = new TypedStack( employee );
            const vehicleDeclaration = modelManager.getType('org.acme.l3.Car');
            const field = vehicleDeclaration.getProperty('owner');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };
            (function () {
                field.accept(resourceValidator,parameters );
            }).should.throw('Model violation in the "TEST" instance. Class "org.acme.l1.Person" has a value of "Resource {id=org.acme.l1.Employee#DAN}". Expected a "Relationship".');
        });
        it('should allow assigning a relationship to a derived type', function () {
            const baseRel = factory.newRelationship('org.acme.l2', 'PrivateOwner', 'DAN');
            const typedStack = new TypedStack( baseRel );
            const vehicleDeclaration = modelManager.getType('org.acme.l3.Car');
            const field = vehicleDeclaration.getProperty('owner');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };
            field.accept(resourceValidator,parameters );
        });

        it('should reject a relationship to a concept', function () {
            const car = factory.newResource('org.acme.l3', 'Car', '123');
            (function () {
                car.owner = factory.newRelationship('org.acme.l3', 'TestConcept');
            }).should.throw(/Cannot create a relationship to org.acme.l3.TestConcept, it is not identifiable./);
        });

        it('should detect a relationship to a non array', function () {
            const car = factory.newResource('org.acme.l3', 'Car', '123');
            car.owners = factory.newRelationship('org.acme.l1', 'Person', '123');
            car.model = 'FOO';

            const typedStack = new TypedStack( car );
            const vehicleDeclaration = modelManager.getType('org.acme.l3.Car');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };
            (function () {
                vehicleDeclaration.accept(resourceValidator,parameters );
            }).should.throw('Instance "org.acme.l3.Car#123" has a property "owners" with type "org.acme.l1.Person" that is not derived from "org.acme.l1.Person[]".');
        });
    });

    describe('#visitField', function() {
        it('should allow assigning a resource type', function () {
            const employee = factory.newResource('org.acme.l1', 'Employee', 'DAN');
            employee.ssn = 'abc';
            const typedStack = new TypedStack( [employee] );
            const vehicleDeclaration = modelManager.getType('org.acme.l3.Car');
            const field = vehicleDeclaration.getProperty('containment');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };
            field.accept(resourceValidator,parameters );
        });

        it('should detect assigning an incompatible resource type', function () {
            const base = factory.newResource('org.acme.l1', 'Base', 'DAN');
            const typedStack = new TypedStack( [base] );
            const vehicleDeclaration = modelManager.getType('org.acme.l3.Car');
            const field = vehicleDeclaration.getProperty('containment');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };
            (function () {
                field.accept(resourceValidator,parameters );
            }).should.throw('Instance "TEST" has a property "containment" with type "org.acme.l1.Base" that is not derived from "org.acme.l1.Person[]".');
        });

        it('should allow assigning a derived type', function () {
            const employeeRel = factory.newRelationship('org.acme.l1', 'Employee', 'DAN');
            const typedStack = new TypedStack( employeeRel );
            const vehicleDeclaration = modelManager.getType('org.acme.l3.Car');
            const field = vehicleDeclaration.getProperty('owner');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };
            field.accept(resourceValidator,parameters );
        });

        it('should fail assigning an incompatible type', function () {
            const baseRel = factory.newRelationship('org.acme.l1', 'Base', 'DAN');
            const typedStack = new TypedStack( baseRel );
            const vehicleDeclaration = modelManager.getType('org.acme.l3.Car');
            const field = vehicleDeclaration.getProperty('owner');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };
            (function () {
                field.accept(resourceValidator,parameters );
            }).should.throw('Instance "TEST" has a property "owner" with type "org.acme.l1.Base" that is not derived from "org.acme.l1.Person".');
        });

        it('should detect using a number type for a string field', function () {
            const typedStack = new TypedStack( 123 );
            const vehicleDeclaration = modelManager.getType('org.acme.l3.Car');
            const field = vehicleDeclaration.getProperty('model');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };

            (function () {
                field.accept(resourceValidator,parameters );
            }).should.throw(/Model violation in the "TEST" instance. The field "model" has a value of "123" \(type of value: "number"\). Expected type of value: "String"./);
        });

        it('should detect using a date type for a string field', function () {
            const typedStack = new TypedStack( dayjs.utc('2016-10-13T14:49:47.971Z') );
            const vehicleDeclaration = modelManager.getType('org.acme.l3.Car');
            const field = vehicleDeclaration.getProperty('model');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };

            (function () {
                field.accept(resourceValidator,parameters );
            }).should.throw('Model violation in the "TEST" instance. The field "model" has a value of ""2016-10-13T14:49:47.971Z"" (type of value: "object"). Expected type of value: "String".');
        });

        it('should detect using a boolean type for a string field', function () {
            const typedStack = new TypedStack( false );
            const vehicleDeclaration = modelManager.getType('org.acme.l3.Car');
            const field = vehicleDeclaration.getProperty('model');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };

            (function () {
                field.accept(resourceValidator,parameters );
            }).should.throw('Model violation in the "TEST" instance. The field "model" has a value of "false" (type of value: "boolean"). Expected type of value: "String".');
        });

        it('should detect using an array type for string field', function () {
            const typedStack = new TypedStack( ['FOO'] );
            const vehicleDeclaration = modelManager.getType('org.acme.l3.Car');
            const field = vehicleDeclaration.getProperty('model');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };

            (function () {
                field.accept(resourceValidator,parameters );
            }).should.throw('Model violation in the "TEST" instance. The field "model" has a value of "["FOO"]" (type of value: "object"). Expected type of value: "String".');
        });

        it('should detect using an invalid array for string[] field', function () {
            const typedStack = new TypedStack( ['FOO', 1] );
            const vehicleDeclaration = modelManager.getType('org.acme.l3.Car');
            const field = vehicleDeclaration.getProperty('serviceHistory');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };

            (function () {
                field.accept(resourceValidator,parameters );
            }).should.throw('Model violation in the "TEST" instance. The field "serviceHistory" has a value of "1" (type of value: "number"). Expected type of value: "String[]".');
        });

        it('should detect using an invalid array for enum field', function () {
            const typedStack = new TypedStack( ['CAR', '1'] );
            const vehicleDeclaration = modelManager.getType('org.acme.l3.Car');
            const field = vehicleDeclaration.getProperty('vehicleTypes');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };

            (function () {
                field.accept(resourceValidator,parameters );
            }).should.throw('Model violation in the "TEST" instance. Invalid enum value of "1" for the field "VehicleType".');
        });

        it('should allow using an valid array for enum field', function () {
            const typedStack = new TypedStack( ['CAR', 'TRUCK'] );
            const vehicleDeclaration = modelManager.getType('org.acme.l3.Car');
            const field = vehicleDeclaration.getProperty('vehicleTypes');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };
            field.accept(resourceValidator,parameters);
        });

        it('should throw if dataType is undefined', () => {
            let mockField = sinon.createStubInstance(Field);
            mockField.getName.returns('propName');
            (() => {
                resourceValidator.visitField(mockField, {stack: {pop: () => {return undefined;}}});
            }).should.throw('Model violation in the "undefined" instance. The field "propName" has a value of "undefined" (type of value: "undefined"). Expected type of value: "undefined".');
        });
    });

    describe('#visitEnumDeclaration', function() {
        it('should detect using an invalid enum', function () {
            const typedStack = new TypedStack('MISSING');
            const enumDeclaration = modelManager.getType('org.acme.enumerations.AnimalType');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };

            (function () {
                enumDeclaration.accept(resourceValidator,parameters );
            }).should.throw('Model violation in the "TEST" instance. Invalid enum value of "MISSING" for the field "AnimalType".');
        });

        it('should validate enum', function () {
            const typedStack = new TypedStack('PIG');
            const enumDeclaration = modelManager.getType('org.acme.enumerations.AnimalType');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'TEST' };
            enumDeclaration.accept(resourceValidator,parameters );
        });
    });

    describe('#visitClassDeclaration', function() {

        it('should detect visiting a non resource', function () {
            const typedStack = new TypedStack('Invalid');
            const assetDeclaration = modelManager.getType('org.acme.l2.Vehicle');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'ABC' };

            (function () {
                assetDeclaration.accept(resourceValidator,parameters );
            }).should.throw('Model violation in the "ABC" instance. Class "org.acme.l2.Vehicle" has the value of "Invalid". Expected a "Resource" or a "Concept".');
        });

        it('should detect using a missing super type', function () {
            const vehicle = factory.newResource('org.acme.l2', 'Vehicle', 'ABC');
            const typedStack = new TypedStack(vehicle);
            const assetDeclaration = modelManager.getType('org.acme.l2.Vehicle');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'ABC' };

            // Nuke the org.acme.l1 namespace -- contains Base!!
            modelManager.deleteModelFile('org.acme.l1');

            (function () {
                assetDeclaration.accept(resourceValidator, parameters);
            }).should.throw(TypeNotFoundException, /org.acme.l1/);
        });

        it('should detect assigning to a missing type', function () {
            const vehicle = factory.newResource('org.acme.l3', 'Car', 'ABC');
            const typedStack = new TypedStack(vehicle);
            const assetDeclaration = modelManager.getType('org.acme.l2.Vehicle');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'ABC' };

            // Nuke the org.acme.removable namespace -- which contains Car!!
            modelManager.deleteModelFile('org.acme.l3');

            (function () {
                assetDeclaration.accept(resourceValidator, parameters);
            }).should.throw(TypeNotFoundException, /org.acme.l3/);
        });

        it('should detect assigning to an abstract type', function () {
            const vehicle = factory.newResource('org.acme.l3', 'Car', 'ABC');
            const typedStack = new TypedStack(vehicle);
            const assetDeclaration = modelManager.getType('org.acme.l2.Vehicle');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'ABC' };

            // Nuke the org.acme.removable namespace -- which contains Car!!
            modelManager.deleteModelFile('org.acme.l3');

            // replace with the same class declared abstract
            modelManager.addCTOModel(abstractLevelThreeModel);

            (function () {
                assetDeclaration.accept(resourceValidator,parameters );
            }).should.throw('The class "org.acme.l3.Car" is abstract and should not contain an instance.');
        });

        it('should detect additional field', function () {
            const vehicle = factory.newResource('org.acme.l3', 'Car', 'ABC');
            vehicle.foo = 'Baz'; // additional field
            const typedStack = new TypedStack(vehicle);
            const assetDeclaration = modelManager.getType('org.acme.l2.Vehicle');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'ABC' };

            (function () {
                assetDeclaration.accept(resourceValidator,parameters );
            }).should.throw('Instance "ABC" has a property named "foo", which is not declared in "org.acme.l3.Car".');
        });

        it('should detect an empty identifier', function () {
            const vehicle = factory.newResource('org.acme.l3', 'Car', 'foo');
            vehicle.setIdentifier('');
            vehicle.model = 'Ford';
            vehicle.numberOfWheels = 4;
            vehicle.milage = 3.14;
            const typedStack = new TypedStack(vehicle);
            const assetDeclaration = modelManager.getType('org.acme.l3.Car');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'ABC' };

            (function () {
                assetDeclaration.accept(resourceValidator,parameters );
            }).should.throw(/has an empty identifier/);
        });

        it('should normalize a shadowed identifier to the value from the indentified field', function () {
            const vehicle = factory.newResource('org.acme.l3', 'Car', 'foo');
            vehicle.$identifier = ''; // empty the identifier
            vehicle.model = 'Ford';
            vehicle.numberOfWheels = 4;
            vehicle.milage = 3.14;
            const typedStack = new TypedStack(vehicle);
            const assetDeclaration = modelManager.getType('org.acme.l3.Car');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'ABC' };

            assetDeclaration.accept(resourceValidator, parameters);
            vehicle.$identifier.should.equal('foo');
        });

        it('should reject a Double which is not finite', function () {
            const vehicle = factory.newResource('org.acme.l3', 'Car', 'foo');
            vehicle.$identifier = '42';
            vehicle.model = 'Ford';
            vehicle.numberOfWheels = 4;
            vehicle.milage = NaN; // NaN
            const typedStack = new TypedStack(vehicle);
            const assetDeclaration = modelManager.getType('org.acme.l3.Car');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'ABC' };

            (() => {
                assetDeclaration.accept(resourceValidator,parameters);
            }).should.throw('Model violation in the "org.acme.l3.Car#foo" instance. The field "milage" has a value of "NaN" (type of value: "number"). Expected type of value: "Double".');
        });

        it('should report undeclared field if not identifiable', () => {
            const data = factory.newConcept('org.acme.l1', 'Data');
            data.name = 'name';
            data.numberOfWipers = 2;
            const typedStack = new TypedStack(data);
            const conceptDeclaration = modelManager.getType('org.acme.l1.Data');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'ABC' };

            (() => {
                resourceValidator.visitClassDeclaration(conceptDeclaration,parameters);
            }).should.throw('Instance "undefined" has a property named "numberOfWipers", which is not declared in "org.acme.l1.Data".');
        });

        it('should report undeclared field with a $ prefix', () => {
            const data = factory.newConcept('org.acme.l1', 'Data');
            data.name = 'name';
            data.$numberOfWipers = 2;
            const typedStack = new TypedStack(data);
            const conceptDeclaration = modelManager.getType('org.acme.l1.Data');
            const parameters = { stack : typedStack, 'modelManager' : modelManager, rootResourceIdentifier : 'ABC' };

            (() => {
                resourceValidator.visitClassDeclaration(conceptDeclaration,parameters);
            }).should.throw('Instance "undefined" has a property named "$numberOfWipers", which is not declared in "org.acme.l1.Data".');
        });
    });

    describe('#reportFieldTypeViolation', () => {
        let mockIdentifiable;
        let mockField;
        beforeEach(() => {
            mockIdentifiable = sinon.createStubInstance(Identifiable);
            mockField = sinon.createStubInstance(Field);
        });

        it('should get fully qualified type and name if Identifiable', () => {
            mockIdentifiable.getFullyQualifiedType.returns('doge');
            mockIdentifiable.getFullyQualifiedIdentifier.returns('com.doge');
            (() => {
                ResourceValidator.reportFieldTypeViolation('id', 'property', mockIdentifiable, mockField);
            }).should.throw('Model violation in the "id" instance. The field "property" has a value of "com.doge" (type of value: "doge"). Expected type of value: "undefined".');
        });

        it('should not fail if strigify fails', () => {
            // Crazy object to force JSON.strigify to throw
            let obj = {};
            obj.a = obj;

            (() => {
                ResourceValidator.reportFieldTypeViolation('id', 'property', obj, mockField);
            }).should.throw('Model violation in the "id" instance. The field "property" has a value of "[object Object]" (type of value: "object"). Expected type of value: "undefined".');
        });
    });

    describe('#checkItem', () => {
        it('should throw if dataType is undefined', () => {
            let mockField = sinon.createStubInstance(Field);
            mockField.getName.returns('propName');
            (() => {
                resourceValidator.checkItem(undefined, mockField, {rootResourceIdentifier: 'identifier'});
            }).should.throw('Model violation in the "identifier" instance. The field "propName" has a value of "undefined" (type of value: "undefined"). Expected type of value: "undefined".');
        });

        it('should throw if class declaration is not found', () => {
            let mockField = sinon.createStubInstance(Field);
            mockField.isPrimitive.returns(false);
            let mockIdentifiable = sinon.createStubInstance(Identifiable);
            mockField.getName.returns('propName');

            let stub = sinon.stub();
            stub.onFirstCall().returns('classDeclaration');
            stub.onSecondCall().throws('error');

            let parameters = {rootResourceIdentifier: 'identifier', modelManager: {getType: stub}};

            (() => {
                resourceValidator.checkItem(mockIdentifiable, mockField, parameters);
            }).should.throw('Model violation in the "identifier" instance. The field "propName" has a value of "undefined" (type of value: "undefined"). Expected type of value: "undefined".');
        });
    });

    describe('#checkRelationship', () => {
        let mockResource;
        let mockClassDeclaration;
        let parameters;

        beforeEach(() => {
            mockResource = sinon.createStubInstance(Resource);
            mockClassDeclaration = sinon.createStubInstance(ClassDeclaration);
            mockClassDeclaration.isConcept.returns(false);
            mockClassDeclaration.getIdentifierFieldName.returns('$identifier');
            parameters = {rootResourceIdentifier: 'identifier', modelManager: {getType: () => {return mockClassDeclaration;}}};
            sandbox.stub(ModelUtil, 'isAssignableTo').returns(true);
        });


        it('should not throw if Resource given and convertResourcesToRelationships is set', () => {
            resourceValidator.options.convertResourcesToRelationships = true;
            (() => {
                resourceValidator.checkRelationship(parameters, {}, mockResource);
            }).should.not.throw();
        });

        it('should not throw if Resource given and permitResourcesForRelationships is set', () => {
            resourceValidator.options.permitResourcesForRelationships = true;
            (() => {
                resourceValidator.checkRelationship(parameters, {}, mockResource);
            }).should.not.throw();
        });
    });
});
