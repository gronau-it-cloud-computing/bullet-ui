/*
 *  Copyright 2016, Yahoo Inc.
 *  Licensed under the terms of the Apache License, Version 2.0.
 *  See the LICENSE file associated with the project for terms.
 */
import Ember from 'ember';
import { AGGREGATIONS, RAWS, DISTRIBUTIONS, DISTRIBUTION_POINTS } from 'bullet-ui/models/aggregation';
import { METRICS } from 'bullet-ui/models/metric';

export default Ember.Component.extend({
  classNames: ['output-data-input'],
  query: null,
  columns: null,
  disabled: false,
  forceDirty: false,
  subfieldSeparator: '',
  subfieldSuffix: '',
  queryManager: Ember.inject.service(),

  // Copy of the imports for the template
  AGGREGATIONS: AGGREGATIONS,
  DISTRIBUTIONS: DISTRIBUTIONS,
  RAWS: RAWS,
  DISTRIBUTION_POINTS: DISTRIBUTION_POINTS,

  metricsList: METRICS.asList(),

  // These *Type computed properties exist because ember-radio-button will set their value locally. Once set,
  // they are independent of the original property. This means they are only used on initial component render.
  outputDataType: Ember.computed('query.aggregation.type', function() {
    return this.findOrDefault('query.aggregation.type', AGGREGATIONS.get('RAW'));
  }),
  rawType: Ember.computed('query.projections.[]', function() {
    return Ember.isEmpty(this.get('query.projections')) ? RAWS.get('ALL') : RAWS.get('SELECT');
  }),
  distributionType: Ember.computed('query.aggregation.attributes', function() {
    return this.findOrDefault('query.aggregation.attributes.type', DISTRIBUTIONS.get('QUANTILE'));
  }),
  pointType: Ember.computed('query.aggregation.attributes', function() {
    return this.findOrDefault('query.aggregation.attributes.pointType', DISTRIBUTION_POINTS.get('NUMBER'));
  }),

  // Helper equalities for template
  isRawAggregation: Ember.computed.equal('outputDataType', AGGREGATIONS.get('RAW')).readOnly(),
  isGroupAggregation: Ember.computed.equal('outputDataType', AGGREGATIONS.get('GROUP')).readOnly(),
  isCountDistinctAggregation: Ember.computed.equal('outputDataType', AGGREGATIONS.get('COUNT_DISTINCT')).readOnly(),
  isDistributionAggregation: Ember.computed.equal('outputDataType', AGGREGATIONS.get('DISTRIBUTION')).readOnly(),
  isTopKAggregation: Ember.computed.equal('outputDataType', AGGREGATIONS.get('TOP_K')).readOnly(),

  isSelectType: Ember.computed.equal('rawType', RAWS.get('SELECT')).readOnly(),
  showRawSelections: Ember.computed.and('isRawAggregation', 'isSelectType').readOnly(),

  isNumberOfPoints: Ember.computed.equal('pointType', DISTRIBUTION_POINTS.get('NUMBER')).readOnly(),
  isPoints: Ember.computed.equal('pointType', DISTRIBUTION_POINTS.get('POINTS')).readOnly(),
  isGeneratedPoints: Ember.computed.equal('pointType', DISTRIBUTION_POINTS.get('GENERATED')).readOnly(),

  canDeleteProjections: Ember.computed('query.projections.[]', function() {
    return this.get('query.projections.length') > 1;
  }).readOnly(),

  canDeleteField: Ember.computed('query.aggregation.groups.[]', function() {
    return this.get('query.aggregation.groups.length') > 1;
  }).readOnly(),

  findOrDefault(valuePath, defaultValue) {
    let value = this.get(valuePath);
    if (Ember.isEmpty(value)) {
      return defaultValue;
    }
    return value;
  },

  getDefaults(type) {
    let values = { points: '', start: '', end: '', increment: '', numberOfPoints: '' };
    if (Ember.isEqual(type, DISTRIBUTIONS.get('QUANTILE'))) {
      values.points = this.get('settings.defaultValues.distributionQuantilePoints');
      values.start = this.get('settings.defaultValues.distributionQuantileStart');
      values.end = this.get('settings.defaultValues.distributionQuantileEnd');
      values.increment = this.get('settings.defaultValues.distributionQuantileIncrement');
    }
    values.numberOfPoints = this.get('settings.defaultValues.distributionNumberOfPoints');
    return values;
  },

  setAttributes(type, pointType) {
    let fields = [];
    let defaults = this.getDefaults(type);
    let lastQuantile = Ember.isEqual(this.get('query.aggregation.attributes.type'), DISTRIBUTIONS.get('QUANTILE'));
    let isQuantile = Ember.isEqual(type, DISTRIBUTIONS.get('QUANTILE'));
    for (let field in defaults) {
      // Wipe the current values if our last type or current type is Quantile but not both -> an XOR operation
      // If you're changing point types within particular distribution type, it shouldn't lose values entered
      // But if you go to QUANTILE or come from QUANTILE, it will wipe all the quantile specific defaults
      fields.push({ name: field, value: defaults[field], forceSet: lastQuantile !== isQuantile });
    }
    fields.push({ name: 'type', value: type, forceSet: true });
    fields.push({ name: 'pointType', value: pointType, forceSet: true });
    this.get('queryManager').setAggregationAttributes(this.get('query'), fields.map(f => Ember.Object.create(f)));
  },

  resetOptions(type) {
    if (!Ember.isEqual(type, AGGREGATIONS.get('RAW'))) {
      this.set('rawType', RAWS.get('ALL'));
    }
    if (!Ember.isEqual(type, AGGREGATIONS.get('DISTRIBUTION'))) {
      this.set('distributionType', DISTRIBUTIONS.get('QUANTILE'));
      this.set('distributionPointType', DISTRIBUTION_POINTS.get('NUMBER'));
    }
  },

  replaceAggregation(type) {
    this.resetOptions(type);
    this.get('queryManager').deleteProjections(this.get('query'));
    return this.get('queryManager').replaceAggregation(this.get('query'), type);
  },

  replaceAggregationWithField(type, modelName, parentName, parentPath) {
    return this.replaceAggregation(type).then(() => {
      return this.get('queryManager').addFieldLike(modelName, parentName, this.get(parentPath));
    });
  },

  replaceAggregationWithGroup(type) {
    return this.replaceAggregationWithField(type, 'group', 'aggregation', 'query.aggregation');
  },

  actions: {
    addRawAggregation(selectType = false) {
      if (selectType) {
        this.replaceAggregationWithField(AGGREGATIONS.get('RAW'), 'projection', 'query', 'query');
      } else {
        this.replaceAggregation(AGGREGATIONS.get('RAW'));
      }
    },

    addGroupAggregation() {
      this.replaceAggregation(AGGREGATIONS.get('GROUP'));
    },

    addCountDistinctAggregation() {
      this.replaceAggregationWithGroup(AGGREGATIONS.get('COUNT_DISTINCT'));
    },

    addTopKAggregation() {
      this.replaceAggregationWithGroup(AGGREGATIONS.get('TOP_K'));
    },

    addDistributionAggregation() {
      this.replaceAggregationWithGroup(AGGREGATIONS.get('DISTRIBUTION')).then(() => {
        // Default type is Quantile, Number of Points
        this.setAttributes(DISTRIBUTIONS.get('QUANTILE'), DISTRIBUTION_POINTS.get('NUMBER'));
      });
    },

    addFieldLike(childModelName, modelFieldName, modelPath) {
      this.get('queryManager').addFieldLike(childModelName, modelFieldName, this.get(modelPath));
    },

    modifyDistributionType(type) {
      this.setAttributes(type, this.get('pointType'));
    },

    modifyDistributionPointType(type) {
      this.setAttributes(this.get('distributionType'), type);
    },

    modifyFieldLike(fieldLike, field) {
      fieldLike.set('field', field);
      fieldLike.set('name', '');
      fieldLike.save();
    },

    deleteProjections() {
      this.get('queryManager').deleteProjections(this.get('query'));
    },

    destroyModel(item) {
      this.get('queryManager').deleteModel(item);
    },

    handleMetricChange(metric, value) {
      metric.set('type', value.get('name'));
      metric.save();
    }
  }
});
