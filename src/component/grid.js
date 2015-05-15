/**
 * echarts组件： 网格
 *
 * @desc echarts基于Canvas，纯Javascript图表库，提供直观，生动，可交互，可个性化定制的数据统计图表。
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 *
 */
define(function (require) {

    var Base = require('./base');
    var number = require('../util/number');
    var parsePercent = number.parsePercent;

    var Cartesian = require('../coord/Cartesian');
    var IntervalScale = require('../coord/scale/Interval');
    var OrdinalScale = require('../coord/scale/Ordinal');

    // 图形依赖
    var RectangleShape = require('zrender/shape/Rectangle');
    
    var zrUtil = require('zrender/tool/util');

    var ecConfig = require('../config');
    var ecQuery = require('../util/ecQuery');
    var deepQuery = ecQuery.deepQuery;
    var queryValue = ecQuery.queryValue;

    // 网格
    ecConfig.grid = {
        zlevel: 0,                  // 一级层叠
        z: 0,                       // 二级层叠
        x: 80,
        y: 60,
        x2: 80,
        y2: 60,
        // width: {totalWidth} - x - x2,
        // height: {totalHeight} - y - y2,
        backgroundColor: 'rgba(0,0,0,0)',
        borderWidth: 1,
        borderColor: '#ccc'
    };

    var zrUtil = require('zrender/tool/util');

    /**
     * 构造函数
     * @param {Object} messageCenter echart消息中心
     * @param {ZRender} zr zrender实例
     * @param {Object} option 图表选项
     *      @param {number=} option.grid.x 直角坐标系内绘图网格起始横坐标，数值单位px
     *      @param {number=} option.grid.y 直角坐标系内绘图网格起始纵坐标，数值单位px
     *      @param {number=} option.grid.width 直角坐标系内绘图网格宽度，数值单位px
     *      @param {number=} option.grid.height 直角坐标系内绘图网格高度，数值单位px
     */
    function Grid(ecTheme, messageCenter, zr, option, myChart) {
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);

        this.refresh(option);

        this._coords = {};

        this._axes = {};
    }
    
    Grid.prototype = {
        type: ecConfig.COMPONENT_TYPE_GRID,

        getX: function () {
            return this._x;
        },

        getY: function () {
            return this._y;
        },

        getWidth: function () {
            return this._width;
        },

        getHeight: function () {
            return this._height;
        },

        getXend: function () {
            return this._x + this._width;
        },

        getYend: function () {
            return this._y + this._height;
        },

        getArea: function () {
            return {
                x: this._x,
                y: this._y,
                width: this._width,
                height: this._height
            };
        },
        
        getBbox: function() {
            return [
                [ this._x, this._y ],
                [ this.getXend(), this.getYend() ]
            ];
        },

        refresh: function (newOption) {
            var zr = this.zr;
            var zrWidth = zr.getWidth();
            var zrHeight = zr.getHeight();
            if (newOption
                || this._zrWidth != zrWidth
                || this._zrHeight != zrHeight
            ) {
                this.clear();
                this.option = newOption || this.option;
                this.option.grid = this.reformOption(this.option.grid);
    
                var gridOption = this.option.grid;
                this._x = parsePercent(gridOption.x, zrWidth);
                this._y = parsePercent(gridOption.y, zrHeight);
                var x2 = parsePercent(gridOption.x2, zrWidth);
                var y2 = parsePercent(gridOption.y2, zrHeight);

                this._zrWidth = zrWidth;
                this._zrHeight = zrHeight;
    
                if (gridOption.width == null) {
                    this._width = zrWidth - this._x - x2;
                }
                else {
                    this._width = parsePercent(gridOption.width, zrWidth);
                }
                this._width = this._width <= 0 ? 10 : this._width;
    
                if (gridOption.height == null) {
                    this._height = zrHeight - this._y - y2;
                }
                else {
                    this._height = parsePercent(gridOption.height, zrHeight);
                }
                this._height = this._height <= 0 ? 10 : this._height;
                
                this._x = this.subPixelOptimize(this._x, gridOption.borderWidth);
                this._y = this.subPixelOptimize(this._y, gridOption.borderWidth);
    
                this.shapeList.push(new RectangleShape({
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    hoverable: false,
                    style: {
                        x: this._x,
                        y: this._y,
                        width: this._width,
                        height: this._height,
                        brushType: gridOption.borderWidth > 0 ? 'both' : 'fill',
                        color: gridOption.backgroundColor,
                        strokeColor: gridOption.borderColor,
                        lineWidth: gridOption.borderWidth
                        // type: this.option.splitArea.areaStyle.type,
                    }
                }));
                this.zr.addShape(this.shapeList[0]);
            }

            this._initCartesian(this.option);
        },

        /**
         * Get cartesian instance
         * @param  {number} xIndex
         * @param  {number} yIndex
         * @return {module:echarts/coord/Cartesian}
         */
        getCartesian: function (xIndex, yIndex) {
            var key = 'x' + xIndex + 'y' + yIndex;
            return this._coords[key];
        },

        /**
         * Get axis instance
         * @param  {number} xIndex
         * @param  {number} yIndex
         * @return {module:echarts/coord/Cartesian.Axis}
         */
        getAxis: function (name, index) {
            return this._axes[name + index];
        },

        /**
         * Initialize cartesian coordinate systems
         * @private
         */
        _initCartesian: function (option) {
            var xAxesList = option.xAxis;
            var yAxesList = option.yAxis;
            var gridX = this._x;
            var gridY = this._y;
            var gridWidth = this._width;
            var gridHeight = this._height;

            if (! (xAxesList instanceof Array)) {
                xAxesList = [xAxesList];
            }
            if (! (yAxesList instanceof Array)) {
                yAxesList = [yAxesList];
            }

            var getScaleByOption = function (axisOption) {
                switch (axisOption.type) {
                    case 'value':
                        return new IntervalScale();
                    case 'category':
                        return new OrdinalScale(axisOption.data);
                }
            }

            var gridPositionOccupied = {
                left: false,
                top: false,
                bottom: false,
                right: false
            };

            var getCoordExtent = function (axisType, axisOption) {
                var position = axisOption.position;
                if (! position) {
                    // Default axis position:
                    //  x axis on the bottom and y axis on the left
                    if (axisType === 'x') {
                        position = gridPositionOccupied.bottom ? 
                            'top ' : 'bottom';
                    }
                    else {
                        position = gridPositionOccupied.left ? 
                            'right ' : 'left';
                    }
                }

                // Take the position on the grid
                gridPositionOccupied[position] = true;

                switch (position) {
                    case 'top':
                    case 'bottom':
                        return [gridX, gridX + gridWidth, position];
                    case 'left':
                    case 'right':
                        return [gridY, gridY + gridHeight, position];
                }
            }

            var i;
            var j;
            var xAxisOpt;
            var yAxisOpt;
            var key;
            var cartesian;
            var coordExtent;
            var axis;
            for (i = 0; i < xAxesList.length; i++) {
                xAxisOpt = xAxesList[i];
                for (j = 0; j < yAxesList.length; j++) {
                    yAxisOpt = yAxesList[j];
                    key = 'x' + i + 'y' + j;
                    cartesian = new Cartesian(key);
                    this._coords[key] = cartesian;

                    // Create x axis
                    coordExtent = getCoordExtent('x', xAxisOpt);
                    axis = cartesian.createAxis(
                        'x', getScaleByOption(xAxisOpt), coordExtent.slice(0, 2)
                    );
                    axis.position = coordExtent[2];
                    axis.type = xAxisOpt.type || 'value';
                    this._axes['x' + i] = axis;

                    // Create y axis
                    coordExtent = getCoordExtent('x', xAxisOpt);
                    axis = cartesian.createAxis(
                        'y', getScaleByOption(yAxisOpt), coordExtent.slice(0, 2)
                    );
                    axis.position = coordExtent[2];
                    axis.type = yAxisOpt.type || 'value';
                    this._axes['y' + i] = axis;
                }
            }

            // Data
            // PENDING Inject data in the chart instance ?
            var stackDataMap = {};
            zrUtil.each(option.series, function (series, idx) {
                var chartType = series.type;
                var defaultCfg = ecConfig[chartType];
                var queryTarget = [series, defaultCfg];
                var coordinateSystem = deepQuery(queryTarget, 'coordinateSystem');

                if (coordinateSystem === 'cartesian') {
                    var xAxisIndex = deepQuery(queryTarget, 'xAxisIndex');
                    var yAxisIndex = deepQuery(queryTarget, 'yAxisIndex');

                    var cartesian = this.getCartesian(xAxisIndex, yAxisIndex);

                    cartesian.series.push(series);

                    var stackKey = chartType + cartesian.name + (series.stack || '');

                    var stackData = stackDataMap[stackKey];
                    if (! stackData) {
                        stackData = stackDataMap[stackKey] = {

                            cartesian: cartesian,

                            // Positive stack
                            px: [],
                            py: [],
                            // Negative stack
                            nx: [],
                            ny: []
                        };
                    }

                    var data = series.data;
                    if (! (data && data.length)) {
                        return;
                    }
                    // TODO
                    var categoryAxis = cartesian.getAxesByScaleType('ordinal');
                    categoryAxis = categoryAxis[0];
                    var valueAxisName;
                    if (categoryAxis) {
                        valueAxisName = categoryAxis.name === 'x' ? 'y' : 'x'
                    }

                    for (var i = 0; i < data.length; i++) {
                        var value = queryValue(data[i]);
                        if (value) {
                            // 双数值轴没有 stack
                            if (! categoryAxis) {
                                stackData.x.push(+value[0]);
                                stackData.y.push(+value[1]);
                            }
                            else {
                                // Stack
                                var key = (value >= 0 ? 'p' : 'n') + valueAxisName;
                                stackData[key][i] = stackData[key][i] || 0;
                                stackData[key][i] += value;
                            }
                        }
                    }
                }
            }, this);
        
            // Data grouped by cartesian
            var dataMap = {};
            zrUtil.each(stackDataMap, function (stackData) {
                var xData = stackData.px.concat(stackData.nx);
                var yData = stackData.py.concat(stackData.ny);

                var name = stackData.cartesian.name;
                var i;

                dataMap[name] = dataMap[name] || {
                    x: [],
                    y: [],
                    cartesian: cartesian
                };

                for (i = 0; i < xData.length; i++) {
                    dataMap[name].x.push(xData[i]);
                }
                for (i = 0; i < yData.length; i++) {
                    dataMap[name].y.push(yData[i]);
                }
            });

            zrUtil.each(dataMap, function (item) {
                var cartesian = item.cartesian;
                if (item.x.length) {
                    cartesian.getAxis('x').scale.setExtentFromData(item.x);
                }
                if (item.y.length) {
                    cartesian.getAxis('y').scale.setExtentFromData(item.y);
                }
            });
        }
    };
    
    zrUtil.inherits(Grid, Base);
    
    require('../component').define('grid', Grid);
    
    return Grid;
});