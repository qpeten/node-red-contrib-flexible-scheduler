module.exports = function(RED) {
    //Cette variable est inpiré du noeud par défaut switch.
    //https://github.com/node-red/node-red/blob/master/nodes/core/logic/10-switch.js
    var operators = {
        'eq': function(a, b) { return a == b; },
        'neq': function(a, b) { return a != b; },
        'lt': function(a, b) { return a < b; },
        'lte': function(a, b) { return a <= b; },
        'gt': function(a, b) { return a > b; },
        'gte': function(a, b) { return a >= b; },
        'btwn': function(a, b, c) { return a >= b && a <= c; },
        'cont': function(a, b) { return (a + "").indexOf(b) != -1; },
        'regex': function(a, b, c, d) { return (a + "").match(new RegExp(b,d?'i':'')); },
        'true': function(a) { return a === true; },
        'false': function(a) { return a === false; },
        'null': function(a) { return (typeof a == "undefined" || a === null); },
        'nnull': function(a) { return (typeof a != "undefined" && a !== null); },
        'istype': function(a, b) {
            if (b === "array") { return Array.isArray(a); }
            else if (b === "buffer") { return Buffer.isBuffer(a); }
            else if (b === "json") {
                try { JSON.parse(a); return true; }   // or maybe ??? a !== null; }
                catch(e) { return false;}
            }
            else if (b === "null") { return a === null; }
            else { return typeof a === b && !Array.isArray(a) && !Buffer.isBuffer(a) && a !== null; }
        }
    };

    function FlexibleSchedulerNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.on('input', function(msg) {
            evaluate();
        });
        
        function isDowValid(daysOfWeek) {
            var dow = (new Date()).getDay();
            dow = dow -1;
            if (dow == -1) {
                dow = 6;
            }
            return daysOfWeek[dow];
        }
       
        //Le code pour cette fonction est inpiré du noeud par défaut switch.
        //https://github.com/node-red/node-red/blob/master/nodes/core/logic/10-switch.js
        function isPrimaryConditionValid(condition) {
            var rule = condition.switchRule;
            var v1,v2;
            var test = null;
            if (condition.propertyType == 'global') {
                test = node.context().global.get(condition.propertyValue);
            }
            else {
                test = node.context().flow.get(condition.propertyValue);
            }
            try {
                v1 = RED.util.evaluateNodeProperty(rule.v,rule.vt,node,null);
            } catch(err) {
                v1 = undefined;
            }
            v2 = rule.v2;
            if (typeof v2 !== 'undefined') {
                try {
                    v2 = RED.util.evaluateNodeProperty(rule.v2,
                                                       rule.v2t,
                                                       node,
                                                       null);
                } catch(err) {
                    v2 = undefined;
                }
            }
            return result = operators[rule.t](test,v1,v2,rule.case);
        }

        function arePrimaryConditionsValid(primaryConditions) {
            if (primaryConditions.length == 0) {
                return true;
            }
            for (var i=0; i<primaryConditions.length; i++) {
                if (isPrimaryConditionValid(primaryConditions[i])) {
                    return true;
                }
            }
            return false;
        }

        function convertToType(value, type) {
            if (type == 'num') {
                if (!isNaN(value*1)) {
                    return [true, value*1];
                }
                else {
                    node.status({fill:"red",shape:"dot",text:"Number parse error"});
                    node.error(value + " is not a valid number");
                    return [false, null];
                }
            }
            else if (type == 'bool') {
                return [true, value=='true'];
            }
            else if (type == 'json') {
            try {
                    return [true, JSON.parse(value)];
                } catch(e) {
                    node.status({fill:"red",shape:"dot",text:"JSON parse error"});
                    node.error(RED._("change.errors.invalid-expr",{error:e.message}));
                    return [false, null];
                }
            }
            else {
                return [true, value];
            }

        }

        function noValidSchuleFound() {
            node.status({fill:"green",shape:"ring",text:"No schedule now"});
            return null;
        }

        function getCurrentSchedule(schedules, forceUpdate) {
            var time = new Date();
            var hour = time.getHours();
            var min = time.getMinutes();
            var scheduleToUse=-1;
            for (var i=0; i<schedules.length; i++) {
                if (forceUpdate) {
                    if (schedules[i].time.hour < hour){
                        scheduleToUse = i;
                    }
                    else if (schedules[i].time.hour == hour && schedules[i].time.min <= min) {
                        scheduleToUse = i;
                    }
                }
                else {
                    if (schedules[i].time.hour == hour && schedules[i].time.min == min) {
                        scheduleToUse = i;
                        break;
                    }
                }
            }
            if (scheduleToUse == -1) {
                return null;
            }
            else {
                return schedules[scheduleToUse];
            }
        }

        function sendMessageFromSchedule(schedule) {
            if (schedule == null) {
                return
            }
            var result = convertToType(schedule.value, schedule.valueType);
            if (result[0]) {
                //node.status({fill:'green',shape:'dot',text:result[1]});
                return node.send({payload:result[1]});
            }
        }

        function findCurrentSchedule() {
            for (var i=0; i<config.rules.length; i++) {
                currentRule = config.rules[i];
                if (isDowValid(currentRule.daysOfWeek)
                        && arePrimaryConditionsValid(currentRule.primaryConditions)) {
                    var sched = null;
                    if (node.lastRuleUsed == null || node.lastRuleUsed != i) {
                        sched = getCurrentSchedule(currentRule.timeConditions,
                                                   true);
                    }
                    else {
                        sched = getCurrentSchedule(currentRule.timeConditions,
                                                   false);
                    }
                    node.lastRuleUsed = i;
                    node.status({fill:"green",shape:"dot",text:"Using rule " + (i+1)});
                    return sendMessageFromSchedule(sched)
                }
            }
            node.lastRuleUsed = -1;
            return noValidSchuleFound();
        }

        function evaluate() {
            return findCurrentSchedule();
        }

        //Evaluate every minute
        node.evalInterval = setInterval(evaluate, 60000);

        node.on('close', function() {
            clearInterval(node.evalInterval);
        });
    }
    RED.nodes.registerType("flexible-scheduler", FlexibleSchedulerNode);
}
