/**
 * Cartesian coordinate system
 * @module  echarts/coord/Cartesian
 * 
 */
define(function (require) {

    'use strict';

    var linearMap = require('../core/number').linearMap;
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

        this._coordExtent = coordExtent;
    };

    Axis.prototype = {

        constructor: Axis,
        
        /**
         * Reverse axis direction
         */
        reverse: function () {
            this._coordExtent = this._coordExtent.reverse();
        },

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
            data = this.scale.normalize(data);

            return linearMap(data, [0, 1], this._coordExtent, clamp);
        },

        /**
         * Map a coord to data. Data is the rank if it has a ordinal scale
         * @param {number} coord
         * @return {number}
         */
        coordToData: function (coord, clamp) {
            var t = linearMap(coord, this._coordExtent, [0, 1], clamp);

            return this.scale.scale(t);
        },
        /**
         * @return {ticks}
         */
        getTicksCoords: function () {
            var ticks = this.scale.getTicks();
            return util.map(ticks, function (data) {
                return this.dataToCoord(data);
            }, this);
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
            return util.map(this._axisKeyList, keyAxisMapper, this);
        },

        /**
         * Get axes list by given scale type
         */
        getAxesByScale: function (scaleType) {
            scaleType = scaleType.toLowerCase();
            return util.filter(
                this.getAxes(),
                function (axis) {
                    return axis.scale.type === scaleType;
                }
            );
        },

        /**
         * Create a basic axis
         * @param {number|string} key
         * @return {module:echarts/coord/Cartesian.Axis}
         */
        createAxis: function (key, scale, coordExtent) {
            var axis = new Axis(key, scale, coordExtent);
            
            this.addAxis(axis);

            return axis;
        },
        
        /**
         * Add axis
         * @param {module:echarts/coord/Cartesian.Axis}
         */
        addAxis: function (axis) {
            var key = axis.name;

            this._axis[key] = axis;

            this._axisKeyList.push(key);
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