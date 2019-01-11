'use strict';

const chai = require('chai');
const generalExtensions = require('../testinfrastructure/general-chai-extensions');
const {testRoot} = require('../testinfrastructure/test-json-creator');
const stubs = require('../testinfrastructure/stubs');
const initDependency = require('../../../../main/app/graph/dependencies/dependency');
const AppContext = require('../../../../main/app/graph/app-context');

const expect = chai.expect;

chai.use(generalExtensions);

const MAXIMUM_DELTA = 0.001;
const CIRCLE_PADDING = 30;

const appContext = AppContext.newInstance({
  visualizationStyles: stubs.visualizationStylesStub(CIRCLE_PADDING),
  calculateTextWidth: stubs.calculateTextWidthStub,
  NodeView: stubs.NodeViewStub,
  RootView: stubs.NodeViewStub //FIXME: necessary??
});

const Root = appContext.getRoot();

const createRootWithToClasses = () => {
  const jsonRoot = testRoot.package('com.tngtech.archunit')
    .add(testRoot.clazz('SomeClass1', 'class').build())
    .add(testRoot.clazz('SomeClass2', 'class').build())
    .build();
  return {
    root: new Root(jsonRoot, null, () => Promise.resolve()),
    class1: 'com.tngtech.archunit.SomeClass1',
    class2: 'com.tngtech.archunit.SomeClass2'
  };
};

const createRootWithToClassesInDifferentPackages = () => {
  const jsonRoot = testRoot.package('com.tngtech.archunit')
    .add(testRoot.package('pkg1')
      .add(testRoot.clazz('SomeClass1', 'class').build())
      .build())
    .add(testRoot.package('pkg2')
      .add(testRoot.clazz('SomeClass2', 'class').build())
      .build())
    .build();
  return {
    root: new Root(jsonRoot, null, () => Promise.resolve()),
    class1: 'com.tngtech.archunit.pkg1.SomeClass1',
    class2: 'com.tngtech.archunit.pkg2.SomeClass2'
  };
};

const createRootWithToClassesAndOneInnerClass = () => {
  const jsonRoot = testRoot.package('com.tngtech.archunit')
    .add(testRoot.clazz('SomeClass1', 'class').build())
    .add(testRoot.clazz('SomeClass2', 'class')
      .havingInnerClass(testRoot.clazz('SomeInnerClass', 'class').build())
      .build())
    .build();
  return {
    root: new Root(jsonRoot, null, () => Promise.resolve()),
    class1: 'com.tngtech.archunit.SomeClass1',
    classWithInnerClass: 'com.tngtech.archunit.SomeClass2',
    innerClass: 'com.tngtech.archunit.SomeClass2$SomeInnerClass'
  };
};

const jsonDependency = (from, to, type) => ({
  originClass: from,
  targetClass: to,
  type,
  description: `Class <${from}> (verb to ${type}) class <${to}>`
});

describe('ElementaryDependency', () => {
  it('knows its start and end node', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const dependency = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'INHERITANCE'));
    expect(dependency.getStartNode()).to.equal(root.root.getByName(root.class1));
    expect(dependency.getEndNode()).to.equal(root.root.getByName(root.class2));
  });

  it('can be shifted to one of the end-nodes: the same dependency should be returned', () => {
    const root = createRootWithToClassesInDifferentPackages();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const dependency = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'INHERITANCE'));
    const act = dependencyCreator.shiftElementaryDependency(dependency,
      dependency.getStartNode().getFullName(), dependency.getEndNode().getFullName());
    expect(act).to.equal(dependency);
  });

  it('can be shifted to one of the end-nodes\' parents if one of them is a package', () => {
    const root = createRootWithToClassesInDifferentPackages();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const dependency = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'INHERITANCE'));
    const act = dependencyCreator.shiftElementaryDependency(dependency,
      dependency.getStartNode().getParent().getFullName(), dependency.getEndNode().getFullName());
    expect(act.description).to.equal('');
    expect(act.type).to.equal('');
    expect(act.isViolation).to.equal(false);
  });

  it('transfers its violation-property if it is shifted to one of the end-nodes\' parents if one of them is a package', () => {
    const root = createRootWithToClassesInDifferentPackages();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const dependency = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'INHERITANCE'));
    dependency.isViolation = true;
    const act = dependencyCreator.shiftElementaryDependency(dependency,
      dependency.getStartNode().getParent().getFullName(), dependency.getEndNode().getFullName());
    expect(act.isViolation).to.equal(true);
  });

  it('can be shifted to one of the end-nodes\' parents if both are classes', () => {
    const root = createRootWithToClassesAndOneInnerClass();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const dependency = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.innerClass, 'INHERITANCE'));
    const act = dependencyCreator.shiftElementaryDependency(dependency,
      dependency.getStartNode().getFullName(), dependency.getEndNode().getParent().getFullName());
    expect(act.type).to.equal('INNERCLASS_DEPENDENCY');
    expect(act.isViolation).to.equal(false);
  });

  it('transfers its violation-property if it is shifted to one of the end-nodes\' parents if both are classes', () => {
    const root = createRootWithToClassesAndOneInnerClass();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const dependency = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.innerClass, 'INHERITANCE'));
    dependency.isViolation = true;
    const act = dependencyCreator.shiftElementaryDependency(dependency,
      dependency.getStartNode().getFullName(), dependency.getEndNode().getParent().getFullName());
    expect(act.isViolation).to.equal(true);
  });
});

describe('GroupedDependency', () => {
  it('is not recreated when one with the same start and end node already exists: the type and the ' +
    'violation-property are updated', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const groupedDependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([]);
    expect(groupedDependency.isViolation).to.equal(false);

    const elementaryDependency = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'INHERITANCE'));
    elementaryDependency.isViolation = true;
    const act = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([elementaryDependency]);
    expect(act).to.equal(groupedDependency);
    expect(act.isViolation).to.equal(true);
  });

  it('has no detailed description and no types, if one of the end nodes is a package', () => {
    const root = createRootWithToClassesInDifferentPackages();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const groupedDependency = dependencyCreator.getUniqueDependency('com.tngtech.archunit.pkg1', root.class2)
      .byGroupingDependencies([]);
    expect(groupedDependency.hasDetailedDescription()).to.equal(false);
  });

  it('is created correctly from one elementary dependency', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const elementaryDependency = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.innerClass, 'FIELD_ACCESS'));
    const act = dependencyCreator.getUniqueDependency(root.class1, root.class2)
      .byGroupingDependencies([elementaryDependency]);
    expect(act.hasDetailedDescription()).to.equal(true);
  });

  it('returns correct properties consisting of the violation-property', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const elementaryDependency = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'INHERITANCE'));
    elementaryDependency.isViolation = true;
    const groupedDependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([elementaryDependency]);
    expect(groupedDependency.getProperties()).to.equal('dependency violation');
  });

  it('returns correct properties consisting only of the violation-property, if one end node is a package', () => {
    const root = createRootWithToClassesInDifferentPackages();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const elementaryDependency = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'INHERITANCE'));
    elementaryDependency.isViolation = true;
    const groupedDependency = dependencyCreator.getUniqueDependency('com.tngtech.archunit.pkg1', root.class2).byGroupingDependencies([elementaryDependency]);
    expect(groupedDependency.getProperties()).to.equal('dependency violation');
  });

  it('is created correctly from two elementary dependencies', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const elementaryDependency1 = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'METHOD_CALL'));
    const elementaryDependency2 = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'INHERITANCE'));
    const act = dependencyCreator.getUniqueDependency(root.class1, root.class2)
      .byGroupingDependencies([elementaryDependency1, elementaryDependency2]);
    expect(act.hasDetailedDescription()).to.equal(true);
  });

  it('is created correctly from three elementary dependencies', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const elementaryDependency1 = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'CONSTRUCTOR_CALL'));
    const elementaryDependency2 = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'METHOD_CALL'));
    const elementaryDependency3 = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'INHERITANCE'));
    const act = dependencyCreator.getUniqueDependency(root.class1, root.class2)
      .byGroupingDependencies([elementaryDependency1, elementaryDependency2, elementaryDependency3]);
    expect(act.hasDetailedDescription()).to.equal(true);
  });

  it('returns correct properties consisting of the type names and the violation-property if one of the ' +
    'elementary dependencies is a violation, when it is created correctly from three elementary dependencies', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const elementaryDependency1 = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'CONSTRUCTOR_CALL'));
    const elementaryDependency2 = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'METHOD_CALL'));
    elementaryDependency2.isViolation = true;
    const elementaryDependency3 = dependencyCreator.createElementaryDependency(jsonDependency(root.class1, root.class2, 'INHERITANCE'));
    const act = dependencyCreator.getUniqueDependency(root.class1, root.class2)
      .byGroupingDependencies([elementaryDependency1, elementaryDependency2, elementaryDependency3]);
    expect(act.getProperties()).to.equal('dependency violation');
  });

  const setNodeVisualDataTo = (node, x, y, r) => {
    node.nodeShape.relativePosition.x = x;
    node.nodeShape.absoluteCircle.x = node.getParent() ? node.getParent().nodeShape.absoluteShape.position.x + x : x;
    node.nodeShape.relativePosition.y = y;
    node.nodeShape.absoluteCircle.y = node.getParent() ? node.getParent().nodeShape.absoluteShape.position.y + y : y;
    node.nodeShape.absoluteCircle.r = r;
  };

  it('calculates the correct coordinates for its end points, if the dependency points to the upper left corner', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const startNode = root.root.getByName(root.class1);
    const endNode = root.root.getByName(root.class2);

    setNodeVisualDataTo(endNode, 20, 20, 10);
    setNodeVisualDataTo(startNode, 45, 40, 15);

    const dependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([]);
    dependency.jumpToPosition();

    const expStartPoint = {x: 33.287, y: 30.6296};
    const expEndPoint = {x: 27.809, y: 26.247};

    expect(dependency.visualData.startPoint).to.deep.closeTo(expStartPoint, MAXIMUM_DELTA);
    expect(dependency.visualData.endPoint).to.deep.closeTo(expEndPoint, MAXIMUM_DELTA);
  });

  it('calculates the correct coordinates for its end points, if the dependency points to the upper side', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const startNode = root.root.getByName(root.class1);
    const endNode = root.root.getByName(root.class2);

    setNodeVisualDataTo(endNode, 20, 20, 10);
    setNodeVisualDataTo(startNode, 20, 60, 15);

    const dependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([]);
    dependency.jumpToPosition();

    const expStartPoint = {x: 20, y: 45};
    const expEndPoint = {x: 20, y: 30};

    expect(dependency.visualData.startPoint).to.deep.closeTo(expStartPoint, MAXIMUM_DELTA);
    expect(dependency.visualData.endPoint).to.deep.closeTo(expEndPoint, MAXIMUM_DELTA);
  });

  it('calculates the correct coordinates for its end points, if the dependency points to the upper right corner', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const startNode = root.root.getByName(root.class1);
    const endNode = root.root.getByName(root.class2);

    setNodeVisualDataTo(endNode, 20, 40, 10);
    setNodeVisualDataTo(startNode, 45, 20, 15);

    const dependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([]);
    dependency.jumpToPosition();

    const expStartPoint = {x: 33.287, y: 29.370};
    const expEndPoint = {x: 27.809, y: 33.753};

    expect(dependency.visualData.startPoint).to.deep.closeTo(expStartPoint, MAXIMUM_DELTA);
    expect(dependency.visualData.endPoint).to.deep.closeTo(expEndPoint, MAXIMUM_DELTA);
  });

  it('calculates the correct coordinates for its end points, if the dependency points to the right side', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const startNode = root.root.getByName(root.class1);
    const endNode = root.root.getByName(root.class2);

    setNodeVisualDataTo(endNode, 60, 20, 10);
    setNodeVisualDataTo(startNode, 20, 20, 15);

    const dependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([]);
    dependency.jumpToPosition();

    const expStartPoint = {x: 35, y: 20};
    const expEndPoint = {x: 50, y: 20};

    expect(dependency.visualData.startPoint).to.deep.closeTo(expStartPoint, MAXIMUM_DELTA);
    expect(dependency.visualData.endPoint).to.deep.closeTo(expEndPoint, MAXIMUM_DELTA);
  });

  it('calculates the correct coordinates for its end points, if the dependency points to the lower right corner', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const startNode = root.root.getByName(root.class1);
    const endNode = root.root.getByName(root.class2);

    setNodeVisualDataTo(endNode, 45, 40, 15);
    setNodeVisualDataTo(startNode, 20, 20, 10);

    const dependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([]);
    dependency.jumpToPosition();

    const expStartPoint = {x: 27.809, y: 26.247};
    const expEndPoint = {x: 33.287, y: 30.6296};

    expect(dependency.visualData.startPoint).to.deep.closeTo(expStartPoint, MAXIMUM_DELTA);
    expect(dependency.visualData.endPoint).to.deep.closeTo(expEndPoint, MAXIMUM_DELTA);
  });

  it('calculates the correct coordinates for its end points, if the dependency points to the lower side', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const startNode = root.root.getByName(root.class1);
    const endNode = root.root.getByName(root.class2);

    setNodeVisualDataTo(endNode, 20, 60, 15);
    setNodeVisualDataTo(startNode, 20, 20, 10);

    const dependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([]);
    dependency.jumpToPosition();

    const expStartPoint = {x: 20, y: 30};
    const expEndPoint = {x: 20, y: 45};

    expect(dependency.visualData.startPoint).to.deep.closeTo(expStartPoint, MAXIMUM_DELTA);
    expect(dependency.visualData.endPoint).to.deep.closeTo(expEndPoint, MAXIMUM_DELTA);
  });

  it('calculates the correct coordinates for its end points, if the dependency points to the lower left corner', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const startNode = root.root.getByName(root.class1);
    const endNode = root.root.getByName(root.class2);

    setNodeVisualDataTo(endNode, 45, 20, 15);
    setNodeVisualDataTo(startNode, 20, 40, 10);

    const dependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([]);
    dependency.jumpToPosition();

    const expStartPoint = {x: 27.809, y: 33.753};
    const expEndPoint = {x: 33.287, y: 29.370};

    expect(dependency.visualData.startPoint).to.deep.closeTo(expStartPoint, MAXIMUM_DELTA);
    expect(dependency.visualData.endPoint).to.deep.closeTo(expEndPoint, MAXIMUM_DELTA);
  });

  it('calculates the correct coordinates for its end points, if the dependency points to the left side', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const startNode = root.root.getByName(root.class1);
    const endNode = root.root.getByName(root.class2);

    setNodeVisualDataTo(endNode, 20, 20, 15);
    setNodeVisualDataTo(startNode, 60, 20, 10);

    const dependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([]);
    dependency.jumpToPosition();

    const expStartPoint = {x: 50, y: 20};
    const expEndPoint = {x: 35, y: 20};

    expect(dependency.visualData.startPoint).to.deep.closeTo(expStartPoint, MAXIMUM_DELTA);
    expect(dependency.visualData.endPoint).to.deep.closeTo(expEndPoint, MAXIMUM_DELTA);
  });

  it('calculates the correct coordinates for its end points, if the end node is within the start node', () => {
    const root = createRootWithToClassesAndOneInnerClass();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const startNode = root.root.getByName(root.classWithInnerClass);
    const endNode = root.root.getByName(root.innerClass);

    setNodeVisualDataTo(startNode, 50, 50, 40);
    setNodeVisualDataTo(endNode, -15, -10, 15);

    const dependency = dependencyCreator.getUniqueDependency(root.classWithInnerClass, root.innerClass).byGroupingDependencies([]);
    dependency.jumpToPosition();

    const expStartPoint = {x: 16.718, y: 27.812};
    const expEndPoint = {x: 22.519, y: 31.680};

    expect(dependency.visualData.startPoint).to.deep.closeTo(expStartPoint, MAXIMUM_DELTA);
    expect(dependency.visualData.endPoint).to.deep.closeTo(expEndPoint, MAXIMUM_DELTA);
  });

  it('calculates the correct coordinates for its end points, if the start node is within the end node', () => {
    const root = createRootWithToClassesAndOneInnerClass();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const startNode = root.root.getByName(root.innerClass);
    const endNode = root.root.getByName(root.classWithInnerClass);

    setNodeVisualDataTo(endNode, 50, 50, 40);
    setNodeVisualDataTo(startNode, -15, -10, 15);

    const dependency = dependencyCreator.getUniqueDependency(root.innerClass, root.classWithInnerClass).byGroupingDependencies([]);
    dependency.jumpToPosition();

    const expStartPoint = {x: 22.519, y: 31.680};
    const expEndPoint = {x: 16.718, y: 27.812};

    expect(dependency.visualData.startPoint).to.deep.closeTo(expStartPoint, MAXIMUM_DELTA);
    expect(dependency.visualData.endPoint).to.deep.closeTo(expEndPoint, MAXIMUM_DELTA);
  });

  it('calculates the correct coordinates for its end points, if the end node is exactly in the middle of the start node: ' +
    'then the dependency points to the lower left corner', () => {
    const root = createRootWithToClassesAndOneInnerClass();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const startNode = root.root.getByName(root.classWithInnerClass);
    const endNode = root.root.getByName(root.innerClass);

    setNodeVisualDataTo(startNode, 50, 50, 40);
    setNodeVisualDataTo(endNode, 0, 0, 15);

    const dependency = dependencyCreator.getUniqueDependency(root.classWithInnerClass, root.innerClass).byGroupingDependencies([]);
    dependency.jumpToPosition();

    const expStartPoint = {x: 78.284, y: 78.284};
    const expEndPoint = {x: 60.607, y: 60.607};

    expect(dependency.visualData.startPoint).to.deep.closeTo(expStartPoint, MAXIMUM_DELTA);
    expect(dependency.visualData.endPoint).to.deep.closeTo(expEndPoint, MAXIMUM_DELTA);
  });

  it('calculates the correct coordinates for its end points if it must "share" the end nodes with another dependency', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const startNode = root.root.getByName(root.class1);
    const endNode = root.root.getByName(root.class2);

    setNodeVisualDataTo(endNode, 20, 20, 10);
    setNodeVisualDataTo(startNode, 45, 40, 15);

    const dependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([]);
    dependency.visualData.mustShareNodes = true;
    dependency.jumpToPosition();

    const expStartPoint = {x: 30.056, y: 38.701};
    const expEndPoint = {x: 21.104, y: 29.939};

    expect(dependency.visualData.startPoint).to.deep.closeTo(expStartPoint, MAXIMUM_DELTA);
    expect(dependency.visualData.endPoint).to.deep.closeTo(expEndPoint, MAXIMUM_DELTA);
  });

  it('calculates the correct coordinates for its end points if it must "share" the end nodes with another dependency ' +
    'and the end node is within the start node', () => {
    const root = createRootWithToClassesAndOneInnerClass();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);
    const startNode = root.root.getByName(root.classWithInnerClass);
    const endNode = root.root.getByName(root.innerClass);

    setNodeVisualDataTo(startNode, 50, 50, 40);
    setNodeVisualDataTo(endNode, -15, -10, 15);

    const dependency = dependencyCreator.getUniqueDependency(root.classWithInnerClass, root.innerClass).byGroupingDependencies([]);
    dependency.visualData.mustShareNodes = true;
    dependency.jumpToPosition();

    const expStartPoint = {x: 23.093, y: 20.402};
    const expEndPoint = {x: 29.231, y: 26.154};

    expect(dependency.visualData.startPoint).to.deep.closeTo(expStartPoint, MAXIMUM_DELTA);
    expect(dependency.visualData.endPoint).to.deep.closeTo(expEndPoint, MAXIMUM_DELTA);
  });

  it('updates its view after jumping to its position: does not show the view if the dependency is hidden', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);

    const dependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([]);
    dependency.hide();
    dependency.jumpToPosition();

    expect(dependency._view.hasJumpedToPosition).to.equal(true);
    expect(dependency._view.isVisible).to.equal(false);
  });

  it('updates its view after moving to its position: does not show the view if the dependency is hidden', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);

    const dependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([]);
    dependency.hide();
    const promise = dependency.moveToPosition();

    expect(dependency._view.hasMovedToPosition).to.equal(true);
    return promise.then(() => expect(dependency._view.isVisible).to.equal(false));
  });

  it('shows the view on jumping to position if the dependency is visible', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);

    const dependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([]);
    dependency._isVisible = true;
    dependency.jumpToPosition();

    expect(dependency._view.isVisible).to.equal(true);
  });

  it('shows the view on moving to position if the dependency is visible', () => {
    const root = createRootWithToClasses();
    const dependencyCreator = initDependency(stubs.DependencyViewStub, root.root);

    const dependency = dependencyCreator.getUniqueDependency(root.class1, root.class2).byGroupingDependencies([]);
    dependency._isVisible = true;
    const promise = dependency.moveToPosition();

    return promise.then(() => expect(dependency._view.isVisible).to.equal(true));
  });
});