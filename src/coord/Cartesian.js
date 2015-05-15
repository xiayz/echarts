/**
 * Cartesian coordinate system
 * @module  echarts/coord/Cartesian
 * 
 */
define(function (require) {

    'use strict';

    var number = require('../core/number');
    var util = require('zrender/tool/util');

    /**
     * @name module:echarts/coord/Cartesian.Axis
     * @constructor
     */
    var Axis = function (name, scale, coordExtent) {
    
        /**
         * Axis name. Such as 'x', 'y', 'z'
         * @type {string}
         */
        this.name = name;

        /**
         * Axis scale
         * @type {module:echarts/coord/scale/*}
         */
        this.scale = scale;
        
        /**
         * Axis type
         *  - 'category'
         *  - 'value'
         *  - 'time'
         *  - 'log'
         * @type {string}
         */
        this.type = 'value';

        this._coordExtent = coordExtent;
    };

    Axis.prototype = {

        constructor: Axis,

        /**
         * Get coord extent
         * @return {Array.<number>}
         */
        getCoordExtent: function () {
            return this._coordExtent;
        },

        /**
         * Set coord extent
         * @param {number} min
         * @param {number} max
         */
        setCoordExtent: function (min, max) {
            var extent = this._coordExtent;
            extent[0] = min;
            extent[1] = max;
        },

        /**
         * Map a data to coord. Data is the rank if it has a ordinal scale
         * @param {number} data
         * @return {number}
         */
        dataToCoord: function (data, clamp) {
            var coordExtent = this._coordExtent;
            data = this.scale.normalize(data);

            return number.linearMap(data, [0, 1], coordExtent, clamp);
        },

        /**
         * Map a coord to data. Data is the rank if it has a ordinal scale
         * @param {number} coord
         * @return {number}
         */
        coordToData: function (coord, clamp) {
            var coordExtent = this._coordExtent;
            data = this.scale.normalize(data);

            return number.linearMap(coord, [0, 1], dataExtent, clamp);
        },
        /**
         * @return {ticks}
         */
        getTicksCoords: function () {
            var ticks = this.scale.getTicks();
            return util.map(ticks, this.coordToData, this);
        }
    };

    function keyAxisMapper(key) {
        return this._axis[key];
    }

    /**
     * @alias module:echarts/coord/Cartesian
     * @constructor
     */
    var Cartesian = function (name) {
        this._axis = {};

        this._axisKeyList = [];

        /**
         * @type {string}
         */
        this.name = name || '';
        /**
         * Series using this cartesian coordinate system
         * @type {Array.<Object>}
         */
        this.series = [];
    };

    Cartesian.prototype = {
        
        constructor: Cartesian,

        /**
         * Get axis
         * @param  {number|string} key
         * @return {module:echarts/coord/Cartesian~Axis}
         */
        getAxis: function (key) {
            return this._axis[key];
        },

        /**
         * Get axes list
         * @return {Array.<module:echarts/coord/Cartesian~Axis>}
         */
        getAxes: function () {
            return util.map(this._axisKeyList, axisNameMapper, this);
        },

        /**
         * Get axes list by given scale type
         */
        getAxesByScaleType: function (type) {
            type = type.toLowerCase();
            return util.filter(
                this.getAxes(),
                function (axis) {
                    return axis.type === type;
                }
            );
        },

        /**
         * Add an axis
         * @param {number|string} key
         */
        createAxis: function (key, scale, coordExtent) {
            var axis = new Axis(key, scale, coordExtent);
            this._axis[key] = axis;

            this._axisKeyList.push(axis);

            return axis;
        },

        /**
         * Convert data to coord in nd space
         * @param {Array.<number>|Object.<string, number>} val
         * @param {boolean} clamp
         * @return {Array.<number>|Object.<string, number>}
         */
        dataToCoord: function (val, clamp) {
            return this._dataCoordConvert(val, 'dataToCoord', clamp);
        },

        /**
         * Convert coord in nd space to data
         * @param  {Array.<number>|Object.<string, number>} val
         * @param {boolean} clamp
         * @return {Array.<number>|Object.<string, number>}
         */
        coordToData: function (val, clamp) {
            return this._dataCoordConversion(val, 'coordToData', clamp);
        },

        _dataCoordConvert: function (input, method, clamp) {
            var axisKeyList = this._axisKeyList;

            var output = input instanceof Array ? [] : {};

            for (var i = 0; i < axisKeyList.length; i++) {
                var key = axisKeyList[i];
                var axis = this._axis[axis];

                output[key] = axis[method](input[key], clamp);
            }

            return output;
        }
    };

    Cartesian.Axis = Axis;

    return Cartesian;
});