/**
 * echarts图表类：柱形图
 *
 * @desc echarts基于Canvas，纯Javascript图表库，提供直观，生动，可交互，可个性化定制的数据统计图表。
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 *
 */
define(function (require) {
    var ChartBase = require('./base');
    
    // 图形依赖
    var RectangleShape = require('zrender/shape/Rectangle');
    // 组件依赖
    require('../component/axis');
    require('../component/grid');
    
    var ecConfig = require('../config');
    var ecQuery = require('../util/ecQuery');
    var deepQuery = ecQuery.deepQuery;
    var query = ecQuery.query;
    var queryValue = ecQuery.queryValue;

    // 柱形图默认参数
    ecConfig.bar = {
        zlevel: 0,                  // 一级层叠
        z: 2,                       // 二级层叠
        coordinateSystem: 'cartesian',
        clickable: true,
        legendHoverLink: true,
        // stack: null
        xAxisIndex: 0,
        yAxisIndex: 0,
        barMinHeight: 0,          // 最小高度改为0
        // barWidth: null,        // 默认自适应
        barGap: '30%',            // 柱间距离，默认为柱形宽度的30%，可设固定值
        barCategoryGap: '20%',    // 类目间柱形距离，默认为类目间距的20%，可设固定值
        itemStyle: {
            normal: {
                // color: '各异',
                barBorderColor: '#fff',       // 柱条边线
                barBorderRadius: 0,           // 柱条边线圆角，单位px，默认为0
                barBorderWidth: 0,            // 柱条边线线宽，单位px，默认为1
                label: {
                    show: false
                    // formatter: 标签文本格式器，同Tooltip.formatter，不支持异步回调
                    // position: 默认自适应，水平布局为'top'，垂直布局为'right'，可选为
                    //           'inside'|'left'|'right'|'top'|'bottom'
                    // textStyle: null      // 默认使用全局文本样式，详见TEXTSTYLE
                }
            },
            emphasis: {
                // color: '各异',
                barBorderColor: '#fff',            // 柱条边线
                barBorderRadius: 0,                // 柱条边线圆角，单位px，默认为0
                barBorderWidth: 0,                 // 柱条边线线宽，单位px，默认为1
                label: {
                    show: false
                    // formatter: 标签文本格式器，同Tooltip.formatter，不支持异步回调
                    // position: 默认自适应，水平布局为'top'，垂直布局为'right'，可选为
                    //           'inside'|'left'|'right'|'top'|'bottom'
                    // textStyle: null      // 默认使用全局文本样式，详见TEXTSTYLE
                }
            }
        }
    };

    var ecData = require('../util/ecData');
    var zrUtil = require('zrender/tool/util');
    var zrColor = require('zrender/tool/color');
    
    /**
     * 构造函数
     * @param {Object} messageCenter echart消息中心
     * @param {ZRender} zr zrender实例
     * @param {Object} series 数据
     * @param {Object} component 组件
     */
    function Bar(ecTheme, messageCenter, zr, option, myChart){
        // 图表基类
        ChartBase.call(this, ecTheme, messageCenter, zr, option, myChart);
        
        this.refresh(option);
    }
    
    Bar.prototype = {
        type: ecConfig.CHART_TYPE_BAR,

        /**
         * 刷新
         */
        refresh: function (newOption) {
            if (newOption) {
                this.option = newOption;
                this.series = newOption.series;
            }
            
            this.backupShapeList();

            this._buildShapes();

            this.addShapeList();
        },

        _buildShapes: function () {

            var legend = this.component.legend;
            var grid = this.component.grid;

            var cartesianBarSeries = [];
            zrUtil.each(this.series, function (series, idx) {
                if (series.type === ecConfig.CHART_TYPE_BAR) {
                    this.reformOption(series);

                    var selected = legend ? legend.isSelected(series.name) : true;
                    this.selectedMap[series.name] = selected;

                    if (! selected) {
                        return;
                    }

                    var coordinateSystem = series.coordinateSystem;
                    if (coordinateSystem === 'cartesian') {
                        cartesianBarSeries.push(series);
                    }
                }
            }, this);

            var barWidthAndOffset = this._calBarWidthAndOffset(cartesianBarSeries);
            var stackDataMap = {};
            var lastPositiveStackPoints = {};
            var lastNegativeStackPoints = {};
            zrUtil.each(cartesianBarSeries, function (series) {
                var xAxisIndex = series.xAxisIndex;
                var yAxisIndex = series.yAxisIndex;
                var cartesian = grid.getCartesian(xAxisIndex, yAxisIndex);
                var data = series.data;

                var categoryAxis = cartesian.getAxesByScale('ordinal')[0];
                // Ignore series not using category axis
                if (! categoryAxis) {
                    return;
                }

                if (series.stack) {
                    var dataStacked = [];
                    var stackKey = cartesian.name + series.stack;
                    var stackData = stackDataMap[stackKey];
                    stackData = stackData || {
                        // Positive stacking
                        p: [],
                        // Negative stacking
                        n: []
                    };
                    stackDataMap[stackKey] = stackData;

                    var positiveStack = stackData.p;
                    var negativeStack = stackData.n;
                    for (var i = 0; i < data.length; i++) {
                        var value = queryValue(data[i], 0);
                        positiveStack[i] = positiveStack[i] || 0;
                        negativeStack[i] = negativeStack[i] || 0;
                        if (value > 0) {
                            dataStacked[i] = value + positiveStack[i];
                            positiveStack[i] = dataStacked[i];
                        }
                        else {
                            dataStacked[i] = value + negativeStack[i];
                            negativeStack[i] = dataStacked[i];
                        }
                    }

                    data = dataStacked;
                }

                var points = grid.dataToCoords(data, xAxisIndex, yAxisIndex);

                var stack = series.stack || '__ec_stack_' + series.seriesIndex;
                var columnInfo = barWidthAndOffset[cartesian.name][stack];
                var columnOffset = columnInfo.offset;
                var columnWidth = columnInfo.width;

                var projectAxis = columnInfo.axis;
                var isHorizontal = projectAxis.isHorizontal();
                var seriesIndex = series.seriesIndex;

                var stackKey = cartesian.name + stack;

                if (! lastPositiveStackPoints[stackKey]) {
                    lastPositiveStackPoints[stackKey] = [];
                }
                if (! lastNegativeStackPoints[stackKey]) {
                    lastNegativeStackPoints[stackKey] = [];
                }

                for (var i = 0; i < data.length; i++) {
                    var value = queryValue(data[i], '-');
                    var name = categoryAxis.scale.getItem(i);

                    var lastStackPoints = value > 0 ? lastPositiveStackPoints : lastNegativeStackPoints;
                    if (value !== '-') {
                        var lastCoord = lastStackPoints[stackKey][i]
                            ? lastStackPoints[stackKey][i][isHorizontal ? 1 : 0]
                            : projectAxis.otherCoord;

                        var point = points[i];
                        var x;
                        var y;
                        var width;
                        var height;
                        if (isHorizontal) {
                            x = point[0] + columnOffset;
                            y = Math.min(point[1], lastCoord);
                            width = columnWidth;
                            height = Math.abs(point[1] - lastCoord);
                        }
                        else {
                            y = point[1] + columnOffset;
                            x = Math.min(point[0], lastCoord);
                            height = columnWidth;
                            width = Math.abs(point[0] - lastCoord);
                        }
                        var shape = this._getBarItem(
                            seriesIndex, i, name, x, y, width, height, isHorizontal ? 'horizontal' : 'vertical'
                        );
                        this.shapeList.push(shape);

                        lastStackPoints[stackKey][i] = point;
                    }
                    else {

                    }
                }

            }, this);
        },

        /**
         * @private 
         */
        _calBarWidthAndOffset: function (barSeries) {
            var grid = this.component.grid;

            // Columns info on each category axis. Key is cartesian name
            var columnsMap = {};

            zrUtil.each(barSeries, function (series, idx) {
                var xAxisIndex = series.xAxisIndex;
                var yAxisIndex = series.yAxisIndex;

                var cartesian = grid.getCartesian(xAxisIndex, yAxisIndex);

                var categoryAxis = cartesian.getAxesByScale('ordinal')[0];

                if (categoryAxis) {
                    var columnsOnAxis = columnsMap[cartesian.name] || {
                        remainedWidth: categoryAxis.getBandWidth(true),
                        autoWidthCount: 0,
                        categoryGap: '20%',
                        gap: '30%',
                        axis: categoryAxis,
                        stacks: {}
                    };
                    var stacks = columnsOnAxis.stacks;
                    columnsMap[cartesian.name] = columnsOnAxis;

                    var stack = series.stack || '__ec_stack_' + series.seriesIndex;

                    if (! stacks[stack]) {
                        columnsOnAxis.autoWidthCount++;
                    }
                    stacks[stack] = stacks[stack] || {
                        width: 0,
                        maxWidth: 0
                    };

                    var barWidth = series.barWidth;
                    // TODO
                    if (barWidth && ! series[stack].width) {
                        barWidth = Math.min(columnsOnAxis.remainedWidth, barWidth);
                        stacks[stack].width = barWidth;
                        columnsOnAxis.remainedWidth -= barWidth;
                    }

                    series.barMaxWidth && (stacks[stack].maxWidth = series.barMaxWidth);
                    series.barGap && (columnsOnAxis.gap = series.barGap);
                    series.barCategoryGap && (columnsOnAxis.categoryGap = series.barCategoryGap);
                }
            });
            
            var result = {};

            zrUtil.each(columnsMap, function (columnsOnAxis, name) {

                result[name] = {};

                var categoryGap = columnsOnAxis.categoryGap;
                var barGapPercent = columnsOnAxis.gap;
                var categoryAxis = columnsOnAxis.axis;
                var bandWidth = categoryAxis.getBandWidth(true);
                if (typeof categoryGap === 'string') {
                    categoryGap = (parseFloat(categoryGap) / 100) * bandWidth;
                }
                if (typeof (barGapPercent === 'string')) {
                    barGapPercent = parseFloat(barGapPercent) / 100;
                }

                var remainedWidth = columnsOnAxis.remainedWidth;
                var autoWidthCount = columnsOnAxis.autoWidthCount;
                var autoWidth = (remainedWidth - categoryGap) / (autoWidthCount + (autoWidthCount - 1) * barGapPercent);
                autoWidth = Math.max(autoWidth, 0);

                // Find if any auto calculated bar exceeded maxBarWidth
                zrUtil.each(columnsOnAxis.stacks, function (column, stack) {
                    var maxWidth = column.maxWidth;
                    if (! column.width && maxWidth && maxWidth < autoWidth) {
                        maxWidth = Math.min(maxWidth, remainedWidth);
                        remainedWidth -= maxWidth;
                        column.width = maxWidth;
                        autoWidthCount--;
                    }
                });

                // Recalculate width again
                autoWidth = (remainedWidth - categoryGap) / (autoWidthCount + (autoWidthCount - 1) * barGapPercent);
                autoWidth = Math.max(autoWidth, 0);

                zrUtil.each(columnsOnAxis.stacks, function (column, stack) {
                    if (! column.width) {
                        column.width = autoWidth;
                    }
                });

                var offset = -bandWidth / 2 + categoryGap / 2;
                zrUtil.each(columnsOnAxis.stacks, function (column, stack) {
                    result[name][stack] = result[name][stack] || {
                        offset: offset,
                        width: column.width,
                        axis: columnsOnAxis.axis
                    };

                    offset += column.width * (1 + barGapPercent);
                });
            });

            return result;
        },

        /**
         * 生成最终图形数据
         */
        _getBarItem: function (seriesIndex, dataIndex, name, x, y, width, height, orient) {
            var series = this.series;
            var barShape;
            var serie = series[seriesIndex];
            var data = serie.data[dataIndex];
            // 多级控制
            var legend = this.component.legend;
            var defaultColor = (legend && legend.getColor(seriesIndex)) 
                || zrColor.getColor(seriesIndex);
            var queryTarget = [data, serie];
            
            var normal = this.deepMerge(queryTarget, 'itemStyle.normal');
            var emphasis = this.deepMerge(queryTarget, 'itemStyle.emphasis');
            var normalBorderWidth = normal.barBorderWidth;
            
            barShape = new RectangleShape({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                clickable: deepQuery(queryTarget, 'clickable'),
                style: {
                    x: x,
                    y: y,
                    width: width,
                    height: height,
                    brushType: 'both',
                    color: this.getItemStyleColor(
                        deepQuery(queryTarget, 'itemStyle.normal.color') || defaultColor,
                        seriesIndex, dataIndex, data
                    ),
                    radius: normal.barBorderRadius,
                    lineWidth: normalBorderWidth,
                    strokeColor: normal.barBorderColor
                },
                highlightStyle: {
                    color: this.getItemStyleColor(
                        deepQuery(queryTarget, 'itemStyle.emphasis.color'),
                        seriesIndex, dataIndex, data
                    ),
                    radius: emphasis.barBorderRadius,
                    lineWidth: emphasis.barBorderWidth,
                    strokeColor: emphasis.barBorderColor
                },
                _orient: orient
            });
            var barShapeStyle = barShape.style;
            barShape.highlightStyle.color = barShape.highlightStyle.color
                            || (typeof barShapeStyle.color === 'string'
                                ? zrColor.lift(barShapeStyle.color, -0.3)
                                : barShapeStyle.color
                               );
            //亚像素优化
            barShapeStyle.x = Math.floor(barShapeStyle.x);
            barShapeStyle.y = Math.floor(barShapeStyle.y);
            barShapeStyle.height = Math.ceil(barShapeStyle.height);
            barShapeStyle.width = Math.ceil(barShapeStyle.width);
            // 考虑线宽的显示优化
            if (normalBorderWidth > 0
                && barShapeStyle.height > normalBorderWidth
                && barShapeStyle.width > normalBorderWidth
            ) {
                barShapeStyle.y += normalBorderWidth / 2;
                barShapeStyle.height -= normalBorderWidth;
                barShapeStyle.x += normalBorderWidth / 2;
                barShapeStyle.width -= normalBorderWidth;
            }
            else {
                // 太小了或者线宽小于0，废了边线
                barShapeStyle.brushType = 'fill';
            }
            
            barShape.highlightStyle.textColor = barShape.highlightStyle.color;
            
            barShape = this.addLabel(barShape, serie, data, name, orient);
            var barShapeStyleList = [                    // normal emphasis都需要检查
                barShapeStyle,
                barShape.highlightStyle
            ];
            for (var i = 0, l = barShapeStyleList.length; i < l; i++) {
                var textPosition = barShapeStyleList[i].textPosition;
                if (textPosition === 'insideLeft'
                    || textPosition === 'insideRight'
                    || textPosition === 'insideTop'
                    || textPosition === 'insideBottom'
                ) {
                    var gap = 5;
                    var textX;
                    var textY;
                    var textAlign;
                    var textBaseline;
                    var x = barShapeStyle.x;
                    var y = barShapeStyle.y;
                    var width = barShapeStyle.width;
                    var height = barShapeStyle.height;
                    switch (textPosition) {
                        case 'insideLeft':
                            textX = x + gap;
                            textY = y + height / 2;
                            textAlign = 'left';
                            textBaseline = 'middle';
                            break;
                        case 'insideRight':
                            textX = x + width - gap;
                            textY = y + height / 2;
                            textAlign = 'right';
                            textBaseline = 'middle';
                            break;
                        case 'insideTop':
                            textX = x + width / 2;
                            textY = y + gap / 2;
                            textAlign = 'center';
                            textBaseline = 'top';
                            break;
                        case 'insideBottom':
                            textX = x + width / 2;
                            textY = y + height - gap / 2;
                            textAlign = 'center';
                            textBaseline = 'bottom';
                            break;
                    }
                    barShapeStyleList[i].textX = textX;
                    barShapeStyleList[i].textY = textY;
                    barShapeStyleList[i].textAlign = textAlign;
                    barShapeStyleList[i].textBaseline = textBaseline;
                    barShapeStyleList[i].textPosition = 'specific';
                    barShapeStyleList[i].textColor = barShapeStyleList[i].textColor || '#fff';
                }
            }
            

            if (deepQuery([data, serie, this.option],'calculable')) {
                this.setCalculable(barShape);
                barShape.draggable = true;
            }

            ecData.pack(
                barShape,
                series[seriesIndex], seriesIndex,
                series[seriesIndex].data[dataIndex], dataIndex,
                name
            );

            return barShape;
        },

        // 位置转换
        getMarkCoord: function (seriesIndex, mpData) {
            // TODO
        },

        /**
         * 动态数据增加动画 
         */
        addDataAnimation: function (params, done) {
            var series = this.series;
            var aniMap = {}; // seriesIndex索引参数
            for (var i = 0, l = params.length; i < l; i++) {
                aniMap[params[i][0]] = params[i];
            }
            var x;
            var dx;
            var y;
            var dy;
            var serie;
            var seriesIndex;
            var dataIndex;

            var aniCount = 0;
            function animationDone() {
                aniCount--;
                if (aniCount === 0) {
                    done && done();
                }
            }
            for (var i = this.shapeList.length - 1; i >= 0; i--) {
                seriesIndex = ecData.get(this.shapeList[i], 'seriesIndex');
                if (aniMap[seriesIndex] && !aniMap[seriesIndex][3]) {
                    // 有数据删除才有移动的动画
                    if (this.shapeList[i].type === 'rectangle') {
                        // 主动画
                        dataIndex = ecData.get(this.shapeList[i], 'dataIndex');
                        serie = series[seriesIndex];
                        if (aniMap[seriesIndex][2] && dataIndex === serie.data.length - 1) {
                            // 队头加入删除末尾
                            this.zr.delShape(this.shapeList[i].id);
                            continue;
                        }
                        else if (!aniMap[seriesIndex][2] && dataIndex === 0) {
                            // 队尾加入删除头部
                            this.zr.delShape(this.shapeList[i].id);
                            continue;
                        }
                        if (this.shapeList[i]._orient === 'horizontal') {
                            // 条形图
                            dy = this.component.yAxis.getAxis(serie.yAxisIndex || 0).getGap();
                            y = aniMap[seriesIndex][2] ? -dy : dy;
                            x = 0;
                        }
                        else {
                            // 柱形图
                            dx = this.component.xAxis.getAxis(serie.xAxisIndex || 0).getGap();
                            x = aniMap[seriesIndex][2] ? dx : -dx;
                            y = 0;
                        }
                        this.shapeList[i].position = [0, 0];

                        aniCount++;
                        this.zr.animate(this.shapeList[i].id, '')
                            .when(
                                query(this.option, 'animationDurationUpdate'),
                                { position: [x, y] }
                            )
                            .done(animationDone)
                            .start();
                    }
                }
            }
            
            // 没有动画
            if (!aniCount) {
                animationDone();
            }
        }
    };
    
    zrUtil.inherits(Bar, ChartBase);
    
    // 图表注册
    require('../chart').define('bar', Bar);
    
    return Bar;
});