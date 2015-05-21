/**
 * echarts图表类：折线图
 *
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 *  	   Yi Shen (https://github.com/pissang)
 * 
 * TODO
 *  - Large mode
 *  - Symbol
 *  - Calcucalable
 *  - Polygon animation
 */
define(function (require) {
    var ChartBase = require('./base');
    
    // 图形依赖
    var PolylineShape = require('zrender/shape/Polyline');
    var PolygonShape = require('zrender/shape/Polygon');
    var IconShape = require('../util/shape/Icon');
    
    var ecQuery = require('../util/ecQuery');
    var query = ecQuery.query;
    var deepQuery = ecQuery.deepQuery;
    var queryValue = ecQuery.queryValue;

    var ecData = require('../util/ecData');
    var zrUtil = require('zrender/tool/util');
    var zrColor = require('zrender/tool/color');

    var ecConfig = require('../config');

    // 组件依赖
    require('../component/axis');
    require('../component/grid');

    // 折线图默认参数
    ecConfig.line = {
        zlevel: 0,                  // 一级层叠
        z: 2,                       // 二级层叠
        coordinateSystem: 'cartesian',
        clickable: true,
        legendHoverLink: true,
        // stack: null
        xAxisIndex: 0,
        yAxisIndex: 0,
        // 'nearest', 'min', 'max', 'average'
        dataFilter: 'nearest',
        itemStyle: {
            normal: {
                // color: 各异,
                label: {
                    show: false
                    // formatter: 标签文本格式器，同Tooltip.formatter，不支持异步回调
                    // position: 默认自适应，水平布局为'top'，垂直布局为'right'，可选为
                    //           'inside'|'left'|'right'|'top'|'bottom'
                    // textStyle: null      // 默认使用全局文本样式，详见TEXTSTYLE
                },
                lineStyle: {
                    width: 2,
                    type: 'solid',
                    shadowColor: 'rgba(0,0,0,0)', //默认透明
                    shadowBlur: 0,
                    shadowOffsetX: 0,
                    shadowOffsetY: 0
                }
            },
            emphasis: {
                // color: 各异,
                label: {
                    show: false
                    // formatter: 标签文本格式器，同Tooltip.formatter，不支持异步回调
                    // position: 默认自适应，水平布局为'top'，垂直布局为'right'，可选为
                    //           'inside'|'left'|'right'|'top'|'bottom'
                    // textStyle: null      // 默认使用全局文本样式，详见TEXTSTYLE
                }
            }
        },
        // smooth: false,
        // symbol: null,         // 拐点图形类型
        symbolSize: 2,           // 拐点图形大小
        // symbolRotate: null,   // 拐点图形旋转控制
        showAllSymbol: false     // 标志图形默认只有主轴显示（随主轴标签间隔隐藏策略）
    };

    /**
     * 构造函数
     * @param {Object} messageCenter echart消息中心
     * @param {ZRender} zr zrender实例
     * @param {Object} series 数据
     * @param {Object} component 组件
     */
    function Line(ecTheme, messageCenter, zr, option, myChart){
        // 图表基类
        ChartBase.call(this, ecTheme, messageCenter, zr, option, myChart);

        this._stackDataMap = {};
        
        this.refresh(option);
    }
    
    Line.prototype = {
        type: ecConfig.CHART_TYPE_LINE,

        /**
         * 刷新
         */
        refresh: function (newOption) {

            this.backupShapeList();

            if (newOption) {
                this.option = newOption;
                this.series = newOption.series;
            }
            
            this._buildCartesian();
            
            this.addShapeList();
        },
            	
        /**
         * Build line chart in cartesian coordinate system
         * @private
         */
        _buildCartesian: function () {
            var grid = this.component.grid;
            var stackDataMap = this._stackDataMap;
            
            zrUtil.each(this.series, function (series, idx) {
    	        if (series.type === ecConfig.CHART_TYPE_LINE) {
                    this.reformOption(series);
    	           
                    var xAxisIndex = series.xAxisIndex;
                    var yAxisIndex = series.yAxisIndex;
                    var cartesian = grid.getCartesian(xAxisIndex, yAxisIndex);
                    var data = series.data;
                    
                    // Chart with two value axes doesn't support stacking
                    if (series.stack && cartesian.getAxesByScale('ordinal').length) {
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
                    this._buildSeriesShapes(idx, points, cartesian);
                }
            }, this);
        },

        /**
         * Build shapes of series
         * @param {number} seriesIndex
         * @param {Array} points
         * @param {module:echarts/coord/Cartesian} cartesian
         * @private
         */
        _buildSeriesShapes: function (seriesIndex, points, cartesian) {
            var series = this.series[seriesIndex];
            var shapeList = this.shapeList;
            var data = series.data;
            
            var normalStylePrefix = 'itemStyle.normal';
            var normalLineStylePrefix = normalStylePrefix + '.lineStyle';
    	   
            // TODO
            var legend = this.component.legend;
            var defaultColor = (legend && legend.getColor(seriesIndex)) 
                || zrColor.getColor(seriesIndex);

            var lineWidth = query(series, normalLineStylePrefix + '.width');
            var lineType = query(series, normalLineStylePrefix + '.type');
            var lineColor = query(series, normalLineStylePrefix + '.color');

            var normalColor = this.getItemStyleColor(
                query(series, normalStylePrefix + '.color'), seriesIndex, -1
            );

            // 填充相关
            var isFill = query(series, normalStylePrefix + '.areaStyle') != null;
            var fillNormalColor = query(
                series, normalStylePrefix + '.areaStyle.color'
            );
            
            var zlevel = this.getZlevelBase();
            var z = this.getZBase();
    	
            var polylineShape;
            var polygonShape;
            var currentPoints;
            
            // TODO
            var bbox = [[], []];
            
            // Axis which the points projected on to construct an area chart.
            // It will use the category axis if have one.
            // For chart with two value axes, it will use the x axis.
            var projectAxis = cartesian.getAxesByScale('ordinal')[0]
                || cartesian.getAxis('x');
            var orient = projectAxis.isHorizontal() ? 'horizontal' : 'vertical';

            var finishSegment = function () {
                var pointLen = currentPoints.length;
                // Finish previous polyline shape
                if (polylineShape && pointLen > 1) {
                    polylineShape.style.pointList = currentPoints;
                    // polylineShape.style.smoothConstraint = bbox;
                    shapeList.push(polylineShape);
                }
                // Finish prevous polygon shape
                if (polygonShape && pointLen > 1) {
                    var polygonPoints = currentPoints.slice();
                    var firstPoint = polygonPoints[0];
                    var lastPoint = polygonPoints[pointLen - 1];
        	       
                    // Add same point into polyline to fit polygon
                    currentPoints.unshift(firstPoint.slice());
                    currentPoints.push(lastPoint.slice());

                    // Point projected on the axis
                    var firstPointProject = firstPoint.slice();
                    var lastPointProject = lastPoint.slice();
    
                    var coordIdx = projectAxis.isHorizontal() ? 1 : 0;
                    firstPointProject[coordIdx] = lastPointProject[coordIdx] 
                        = projectAxis.otherCoord;
    
                    polygonPoints.unshift(
                        // Duplicate points to make sharp turning
                        firstPointProject, firstPointProject.slice(),
                        firstPoint, firstPoint.slice()
                    );
                    polygonPoints.push(
                        lastPoint, lastPoint.slice(),
                        lastPointProject, lastPointProject.slice()
                    );
    
                    polygonShape.style.pointList = polygonPoints;
                    // TODO
                    // polygonShape.style.smoothConstraint = bbox;
                    shapeList.push(polygonShape);
                }

                chunk++;
            };

            var chunk = 0;

            for (var i = 0; i < data.length; i++) {
                var dataItem = data[i];
                var value = queryValue(dataItem, '-');

                // Create a new polyline if data is '-' or i === 0
                if (! polylineShape || value === '-') {
                    currentPoints = [];
    	              
                    // Finish previus segment
                    finishSegment();

                    polylineShape = new PolylineShape({
                        zlevel: zlevel,
                        z: z + 1,
                        style: {
                            miterLimit: lineWidth,
                            strokeColor: lineColor || normalColor || defaultColor,
                            lineWidth: lineWidth,
                            lineType: lineType,
                            smooth: series.smooth ? 0.3 : 0,
                            shadowColor: query(
                              series, normalLineStylePrefix + '.shadowColor'
                            ),
                            shadowBlur: query(
                              series, normalLineStylePrefix + '.shadowBlur'
                            ),
                            shadowOffsetX: query(
                              series, normalLineStylePrefix + '.shadowOffsetX'
                            ),
                            shadowOffsetY: query(
                              series, normalLineStylePrefix + '.shadowOffsetY'
                            )
                        },
                        hoverable: false,
                        _orient: orient,
                        _main: true,
                        _seriesIndex: seriesIndex
                    });

                    ecData.pack(
                        polylineShape,
                        series, seriesIndex,
                        0, chunk, series.name
                    );

                    // Polygon of area charts
                    if (isFill) {
                        polygonShape = new PolygonShape({
                            zlevel: this.getZlevelBase(),
                            z: this.getZBase(),
                            style: {
                                miterLimit: lineWidth,
                                brushType: 'fill',
                                smooth: series.smooth ? 0.3 : 0,
                                color: fillNormalColor
                                       ? fillNormalColor
                                       : zrColor.alpha(defaultColor,0.5)
                            },
                            highlightStyle: {
                                brushType: 'fill'
                            },
                            hoverable: false,
                            _orient: orient,
                            _main: true,
                            _seriesIndex: seriesIndex
                        });
                        ecData.pack(
                            polygonShape,
                            series, seriesIndex,
                            0, chunk, series.name
                        );
                    }
                }

                if (value !== '-') {
                    var point = points[i];
                    currentPoints.push(point);   
                }
            }
            
            // Finish last segment
            finishSegment();

        },
        
        _isLarge: function(orient, singlePL) {
            if (singlePL.length < 2) {
                return false;
            }
            else {
                return orient === 'horizontal'
                       ? (Math.abs(singlePL[0][0] - singlePL[1][0]) < 0.5)
                       : (Math.abs(singlePL[0][1] - singlePL[1][1]) < 0.5);
            }
        },

        /**
         * 大规模pointList优化
         * TODO 使用 data
         */
        _getLargePointList: function(orient, points, filter) {
            var grid = this.component.grid;
            var total = orient === 'horizontal'
                ? grid.getWidth() : grid.getHeight();
            
            var len = points.length;
            var newList = [];

            if (typeof(filter) != 'function') {
                switch (filter) {
                    case 'min':
                        filter = function (arr) {
                            return Math.max.apply(null, arr);
                        };
                        break;
                    case 'max':
                        filter = function (arr) {
                            return Math.min.apply(null, arr);
                        };
                        break;
                    case 'average':
                        filter = function (arr) {
                            var total = 0;
                            for (var i = 0; i < arr.length; i++) {
                                total += arr[i];
                            }
                            return total / arr.length;
                        };
                        break;
                    default:
                        filter = function (arr) {
                            return arr[0];
                        }
                }
            }

            var windowData = [];
            for (var i = 0; i < total; i++) {
                var idx0 = Math.floor(len / total * i);
                var idx1 = Math.min(Math.floor(len / total * (i + 1)), len);
                if (idx1 <= idx0) {
                    continue;
                }

                for (var j = idx0; j < idx1; j++) {
                    windowData[j - idx0] = orient === 'horizontal'
                        ? points[j][1] : points[j][0];
                }

                windowData.length = idx1 - idx0;
                var filteredVal = filter(windowData);
                var nearestIdx = -1;
                var minDist = Infinity;
                // 寻找值最相似的点，使用其其它属性
                for (var j = idx0; j < idx1; j++) {
                    var val = orient === 'horizontal'
                        ? points[j][1] : points[j][0];
                    var dist = Math.abs(val - filteredVal);
                    if (dist < minDist) {
                        nearestIdx = j;
                        minDist = dist;
                    }
                }

                var newItem = points[nearestIdx].slice();
                if (orient === 'horizontal') {
                    newItem[1] = filteredVal;
                }
                else {
                    newItem[0] = filteredVal;
                }
                newList.push(newItem);
            }
            return newList;
        },

        /**
         * 生成空数据所需的可计算提示图形
         */
        _getCalculableItem: function (seriesIndex, dataIndex, name, x, y, orient) {
            var series = this.series;
            var color = series[seriesIndex].calculableHolderColor
                        || this.ecTheme.calculableHolderColor
                        || ecConfig.calculableHolderColor;

            var itemShape = this._getSymbol(
                seriesIndex, dataIndex, name,
                x, y, orient
            );
            itemShape.style.color = color;
            itemShape.style.strokeColor = color;
            itemShape.rotation = [0,0];
            itemShape.hoverable = false;
            itemShape.draggable = false;
            itemShape.style.text = '';

            return itemShape;
        },

        /**
         * 生成折线图上的拐点图形
         */
        _getSymbol: function (seriesIndex, dataIndex, name, x, y, orient) {
            var series = this.series;
            var serie = series[seriesIndex];
            var data = serie.data[dataIndex];
            
            var itemShape = this.getSymbolShape(
                serie, seriesIndex, data, dataIndex, name, 
                x, y,
                this._sIndex2ShapeMap[seriesIndex], 
                this._sIndex2ColorMap[seriesIndex],
                '#fff',
                orient === 'vertical' ? 'horizontal' : 'vertical' // 翻转
            );
            itemShape.zlevel = this.getZlevelBase();
            itemShape.z = this.getZBase() + 1;
            
            if (deepQuery([data, serie, this.option], 'calculable')) {
                this.setCalculable(itemShape);
                itemShape.draggable = true;
            }
            
            return itemShape;
        },

        // 位置转换
        // TODO
        getMarkCoord: function (seriesIndex, mpData) {
            var series = this.series[seriesIndex];
            var xMarkMap = this.xMarkMap[seriesIndex];
            
            var markerType = mpData.type;

            if (markerType
                && (markerType === 'max' || markerType === 'min' || markerType === 'average')
            ) {
            }
            
            return [
            ];
        },
        
        ontooltipHover: function (param, tipShape) {
            var seriesIndex = param.seriesIndex;
            var dataIndex = param.dataIndex;
            var seriesPL;
            var singlePL;
            var len = seriesIndex.length;
            while (len--) {
                seriesPL = this.finalPLMap[seriesIndex[len]];
                if (seriesPL) {
                    for (var i = 0, l = seriesPL.length; i < l; i++) {
                        singlePL = seriesPL[i];
                        for (var j = 0, k = singlePL.length; j < k; j++) {
                            if (dataIndex === singlePL[j][2]) {
                                tipShape.push(this._getSymbol(
                                    seriesIndex[len],   // seriesIndex
                                    singlePL[j][2],     // dataIndex
                                    singlePL[j][3],     // name
                                    singlePL[j][0],     // x
                                    singlePL[j][1],     // y
                                    'horizontal'
                                ));
                            }
                        }
                    }
                }
            }
        },

        /**
         * 动态数据增加动画 
         * TODO
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
            var seriesIndex;
            var pointList;
            var isHorizontal; // 是否横向布局， isHorizontal;

            var aniCount = 0;
            function animationDone() {
                aniCount--;
                if (aniCount === 0) {
                    done && done();
                }
            }
            function animationDuring(target) {
                // 强制更新曲线控制点
                target.style.controlPointList = null;
            }

            for (var i = this.shapeList.length - 1; i >= 0; i--) {
                seriesIndex = this.shapeList[i]._seriesIndex;
                if (aniMap[seriesIndex] && !aniMap[seriesIndex][3]) {
                    // 有数据删除才有移动的动画
                    if (this.shapeList[i]._main && this.shapeList[i].style.pointList.length > 1) {
                        pointList = this.shapeList[i].style.pointList;
                        // 主线动画
                        dx = Math.abs(pointList[0][0] - pointList[1][0]);
                        dy = Math.abs(pointList[0][1] - pointList[1][1]);
                        isHorizontal = this.shapeList[i]._orient === 'horizontal';
                            
                        if (aniMap[seriesIndex][2]) {
                            // 队头加入删除末尾
                            if (this.shapeList[i].type === 'polygon') {
                                //区域图
                                var len = pointList.length;
                                this.shapeList[i].style.pointList[len - 3] = pointList[len - 2];
                                this.shapeList[i].style.pointList[len - 3][isHorizontal ? 0 : 1]
                                    = pointList[len - 4][isHorizontal ? 0 : 1];
                                this.shapeList[i].style.pointList[len - 2] = pointList[len - 1];
                            }
                            this.shapeList[i].style.pointList.pop();
                            isHorizontal ? (x = dx, y = 0) : (x = 0, y = -dy);
                        }
                        else {
                            // 队尾加入删除头部
                            this.shapeList[i].style.pointList.shift();
                            if (this.shapeList[i].type === 'polygon') {
                                //区域图
                                var targetPoint =this.shapeList[i].style.pointList.pop();
                                isHorizontal
                                ? (targetPoint[0] = pointList[0][0])
                                : (targetPoint[1] = pointList[0][1]);
                                this.shapeList[i].style.pointList.push(targetPoint);
                            }
                            isHorizontal ? (x = -dx, y = 0) : (x = 0, y = dy);
                        }
                        this.shapeList[i].style.controlPointList = null;
                        
                        this.zr.modShape(this.shapeList[i]);
                    }
                    else {
                        // 拐点动画
                        if (aniMap[seriesIndex][2] 
                            && this.shapeList[i]._dataIndex 
                                === series[seriesIndex].data.length - 1
                        ) {
                            // 队头加入删除末尾
                            this.zr.delShape(this.shapeList[i].id);
                            continue;
                        }
                        else if (!aniMap[seriesIndex][2] 
                                 && this.shapeList[i]._dataIndex === 0
                        ) {
                            // 队尾加入删除头部
                            this.zr.delShape(this.shapeList[i].id);
                            continue;
                        }
                    }
                    this.shapeList[i].position = [0, 0];

                    aniCount++;
                    this.zr.animate(this.shapeList[i].id, '')
                        .when(
                            this.query(this.option, 'animationDurationUpdate'),
                            { position: [ x, y ] }
                        )
                        .during(animationDuring)
                        .done(animationDone)
                        .start();
                }
            }

            // 没有动画
            if (!aniCount) {
                animationDone();
            }
        }
    };

    function legendLineIcon(ctx, style, refreshNextFrame) {
        var x = style.x;
        var y = style.y;
        var width = style.width;
        var height = style.height;
        
        var dy = height / 2;
        
        if (style.symbol.match('empty')) {
            ctx.fillStyle = '#fff';
        }
        style.brushType = 'both';
        
        var symbol = style.symbol.replace('empty', '').toLowerCase();
        if (symbol.match('star')) {
            dy = (symbol.replace('star','') - 0) || 5;
            y -= 1;
            symbol = 'star';
        } 
        else if (symbol === 'rectangle' || symbol === 'arrow') {
            x += (width - height) / 2;
            width = height;
        }
        
        var imageLocation = '';
        if (symbol.match('image')) {
            imageLocation = symbol.replace(
                    new RegExp('^image:\\/\\/'), ''
                );
            symbol = 'image';
            x += Math.round((width - height) / 2) - 1;
            width = height = height + 2;
        }
        symbol = IconShape.prototype.iconLibrary[symbol];
        
        if (symbol) {
            var x2 = style.x;
            var y2 = style.y;
            ctx.moveTo(x2, y2 + dy);
            ctx.lineTo(x2 + 5, y2 + dy);
            ctx.moveTo(x2 + style.width - 5, y2 + dy);
            ctx.lineTo(x2 + style.width, y2 + dy);
            var self = this;
            symbol(
                ctx,
                {
                    x: x + 4,
                    y: y + 4,
                    width: width - 8,
                    height: height - 8,
                    n: dy,
                    image: imageLocation
                },
                function () {
                    self.modSelf();
                    refreshNextFrame();
                }
            );
        }
        else {
            ctx.moveTo(x, y + dy);
            ctx.lineTo(x + width, y + dy);
        }
    }
    IconShape.prototype.iconLibrary['legendLineIcon'] = legendLineIcon;
    
    zrUtil.inherits(Line, ChartBase);
    
    // 图表注册
    require('../chart').define('line', Line);
    
    return Line;
});