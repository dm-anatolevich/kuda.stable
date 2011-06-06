/* 
 * Kuda includes a library and editor for authoring interactive 3D content for the web.
 * Copyright (C) 2011 SRI International.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms
 * of the GNU General Public License as published by the Free Software Foundation; either 
 * version 2 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; 
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program; 
 * if not, write to the Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor, 
 * Boston, MA 02110-1301 USA.
 */

var editor = (function(module) {
    module.tools = module.tools || {};
    
    module.tools.ToolConstants = module.tools.ToolConstants || {};
	module.tools.ToolConstants.SHAPE_PICK = "ShapePick";
	module.tools.ToolConstants.CAM_MOVE = "CameraMove";
	
    module.EventTypes = module.EventTypes || {};
	module.EventTypes.ArgumentSet = "messaging.ArgumentSet";
	module.EventTypes.TriggerSet = "messaging.TriggerSet";
	module.EventTypes.ActionSet = "messaging.ActionSet";
	module.EventTypes.TargetCreated = "messaging.TargetCreated";
    module.EventTypes.TargetRemoved = "messaging.TargetRemoved";
    module.EventTypes.TargetUpdated = "messaging.TargetUpdated";
    module.EventTypes.EditTarget = "messaging.view.EditTarget";
    module.EventTypes.RemoveTarget = "messaging.eventList.RemoveTarget";
    module.EventTypes.SaveTarget = "messaging.view.SaveTarget";
	module.EventTypes.SelectTrigger = "messaging.SelectTrigger";
	module.EventTypes.SelectAction = "messaging.SelectAction";
	module.EventTypes.SelectTarget = "messaging.SelectTarget";
	
	var TRIGGER_WRAPPER = '#causeTreeWrapper',
		ACTION_WRAPPER = '#effectTreeWrapper';
	
////////////////////////////////////////////////////////////////////////////////
//                                 Utilities                                  //
////////////////////////////////////////////////////////////////////////////////
		
	module.tools.DispatchProxy = function() {
		// The set of MessageSpecs (and MessageTargets) being created by the
		// messaging tool
		this.worldSpecs = new hemi.utils.Hashtable();
		// The set of MessageSpecs used by the editor
		this.editorSpecs = null;
	};
	
	module.tools.DispatchProxy.prototype = {
		swap: function() {
			if (this.editorSpecs === null) {
				this.editorSpecs = hemi.dispatch.msgSpecs;
				hemi.dispatch.msgSpecs = this.worldSpecs;
			}
		},
		
		unswap: function() {
			if (this.editorSpecs !== null) {
				hemi.dispatch.msgSpecs = this.editorSpecs;
				this.editorSpecs = null;
			}
		},
		
		getTargetSpec: function(target) {
			this.swap();
			var ret = hemi.dispatch.getTargetSpec(target);
			this.unswap();
			return ret;
		},
		
		getTargets: function(attributes, wildcards) {
			this.swap();
			var ret = hemi.dispatch.getTargets(attributes, wildcards);
			this.unswap();
			return ret;
		},
		
		registerTarget: function(src, msg, handler, opt_func, opt_args) {
			this.swap();
			var ret = hemi.dispatch.registerTarget(src, msg, handler, opt_func, 
				opt_args);
			this.unswap();
			return ret;
		},
		
		removeTarget: function(target, opt_attributes) {
			this.swap();
			var ret = hemi.dispatch.removeTarget(target, opt_attributes);
			this.unswap();
			return ret;
		},
		
		cleanup: function() {
			this.swap();
			hemi.dispatch.cleanup();
			this.unswap();
		},
		
		toOctane: function(){
			this.swap();
			var ret = hemi.dispatch.toOctane();
			this.unswap();
			return ret;
		}
	};
    
////////////////////////////////////////////////////////////////////////////////
//                                   Model                                    //
////////////////////////////////////////////////////////////////////////////////


    /**
     * A MessagingModel
     */
    module.tools.MessagingModel = module.tools.ToolModel.extend({
		init: function() {
			this._super();
			
			this.dispatchProxy = new module.tools.DispatchProxy();
			this.msgTarget = null;
			this.source = null;
			this.type = null;
			this.handler = null;
			this.method = null;
			this.args = new Hashtable();
			
			this.autoCompleteList = [{
				label: hemi.dispatch.MSG_ARG + 'data.',
				value: hemi.dispatch.MSG_ARG + 'data.',
				desc: 'message data object'
			}];
	    },
		
		copyTarget: function(msgTarget) {
			var spec = this.dispatchProxy.getTargetSpec(msgTarget),
				isValueCheck = msgTarget.handler instanceof hemi.handlers.ValueCheck,
				source, type, handler, method, argList;
			
			if (isValueCheck) {
				type = msgTarget.handler.values[0];
				handler = msgTarget.handler.handler;
				method = msgTarget.handler.func;
				argList = msgTarget.handler.args;
				
				if (spec.src === hemi.world.WORLD_ID) {
					var modelName = type.split('.').shift(),
						models = hemi.world.getModels({name:modelName});
					
					source = module.treeData.createShapePickCitizen(models[0]);
				} else {
					source = module.treeData.createCamMoveCitizen(hemi.world.camera);
				}
			} else {
				source = spec.src;
				type = spec.msg;
				handler = msgTarget.handler;
				method = msgTarget.func;
				argList = msgTarget.args;
			}
			
			this.setMessageSource(source);
			this.setMessageType(type);
			this.setMessageHandler(handler);
			this.setMethod(method);
			
			if (argList != null) {
				var params = module.utils.getFunctionParams(this.handler[this.method]);
				
				for (var ndx = 0, len = params.length; ndx < len; ndx++) {
					this.setArgument(params[ndx], argList[ndx]);
				}
			}
		},
		
		removeTarget: function(target) {
			if (this.msgTarget === target) {
				this.msgTarget = null;
			}
			
			var spec = this.dispatchProxy.getTargetSpec(target),
				source = hemi.world.getCitizenById(spec.src);
				
			this.dispatchProxy.removeTarget(target);
			
			if (target.handler instanceof hemi.handlers.ValueCheck) {
				target.handler.cleanup();
			}
			
	        this.notifyListeners(module.EventTypes.TargetRemoved, {
				target: target,
				source: source
			});
		},
	    
	    setMessageSource: function(source) {
			if (source === null || source.getId != null) {
				this.source = source;
			} else if (source === hemi.dispatch.WILDCARD || source === module.treeData.MSG_WILDCARD) {
				this.source = module.treeData.MSG_WILDCARD;
			} else {
				this.source = hemi.world.getCitizenById(source);
			}
	    },
	    
	    setMessageType: function(type) {
			if (type === hemi.dispatch.WILDCARD || type === module.treeData.MSG_WILDCARD) {
				this.type = module.treeData.MSG_WILDCARD;
			} else {
				this.type = type;
			}
			
			this.notifyListeners(module.EventTypes.TriggerSet, {
				source: this.source,
				message: this.type
			});
	    },
	    
	    setMessageHandler: function(handler) {
			this.handler = handler;
	    },
	    
	    setMethod: function(method) {
	        this.method = method;
			this.args.clear();
			
			if (method !== null) {
				var methodParams = module.utils.getFunctionParams(this.handler[method]);
				
				for (var ndx = 0, len = methodParams.length; ndx < len; ndx++) {
					var param = methodParams[ndx];
					
		            this.args.put(param, {
						ndx: ndx,
						value: null
					});
				}
			}
			
			this.notifyListeners(module.EventTypes.ActionSet, {
				handler: this.handler,
				method: this.method
			});
	    },
		
		setArgument: function(argName, argValue) {
	        var arg = this.args.get(argName);
	        
	        if (arg != null) {
	            arg.value = argValue;
	        }
	        
	        this.args.put(argName, arg);
			this.notifyListeners(module.EventTypes.ArgumentSet, {
				name: argName,
				value: argValue
			});
		},
		
	    save: function(name, opt_type) {
			var values = this.args.values(),
				args = [],
				editId = null,
				newTarget;
			
			if (this.msgTarget !== null) {
				this.dispatchProxy.removeTarget(this.msgTarget);
				
				if (this.msgTarget.handler instanceof hemi.handlers.ValueCheck) {
					this.msgTarget.handler.cleanup();
				}
				
				this.msgTarget.cleanup();
			}
			
			for (var ndx = 0, len = values.length; ndx < len; ndx++) {
				var val = values[ndx];
				args[val.ndx] = val.value;
			}
			
			if (this.source.shapePick) {
				this.dispatchProxy.swap();
				newTarget = hemi.handlers.handlePick(
					this.type,
					this.handler,
					this.method,
					args);
				this.dispatchProxy.unswap();
			}
			else if (this.source.camMove) {
				this.dispatchProxy.swap();
				var viewpoint = hemi.world.getCitizenById(this.type);
				newTarget = hemi.handlers.handleCameraMove(
					hemi.world.camera,
					viewpoint,
					this.handler,
					this.method,
					args);
				this.dispatchProxy.unswap();
			}
			else {
				var src = this.source === module.treeData.MSG_WILDCARD ? hemi.dispatch.WILDCARD 
						: this.source.getId(),
					type = this.type === module.treeData.MSG_WILDCARD ? hemi.dispatch.WILDCARD 
						: this.type;
				
				newTarget = this.dispatchProxy.registerTarget(
		            src,
		            type,
		            this.handler,
		            this.method,
		            args);
			}
			
			newTarget.name = name;
			newTarget.type = opt_type;
			
			if (this.msgTarget !== null) {
				newTarget.dispatchId = this.msgTarget.dispatchId;
				this.notifyListeners(module.EventTypes.TargetUpdated, newTarget);
			} else {
				this.notifyListeners(module.EventTypes.TargetCreated, newTarget);
			}
			
			this.msgTarget = null;
			this.args.each(function(key, value) {
				value.value = null;
			});
		},
		
		worldCleaned: function() {
			var targets = this.dispatchProxy.getTargets();
			
			for (var ndx = 0, len = targets.length; ndx < len; ndx++) {
	            var target = targets[ndx];
	            this.notifyListeners(module.EventTypes.TargetRemoved, target);
	        }
			
			this.dispatchProxy.cleanup();
			var citizens = hemi.world.getCitizens();
			
			// TODO: this is a bug, needs to be updated to the common model
			for (var ndx = 0, len = citizens.length; ndx < len; ndx++) {
				this.removeCitizen(citizens[ndx]);
			}
			
			this.source = null;
			this.type = null;
			this.handler = null;
			this.method = null;
			this.args.clear();
			this.msgTarget = null;
	    },
		
		worldLoaded: function() {
			var targets = this.dispatchProxy.getTargets();
			
			for (var ndx = 0, len = targets.length; ndx < len; ndx++) {
				var target = targets[ndx];
				
				if (target.name.match(module.tools.ToolConstants.EDITOR_PREFIX) === null) {
					this.notifyListeners(module.EventTypes.TargetCreated, target);
				}
	        }
	    }
	});
	
////////////////////////////////////////////////////////////////////////////////
//                                   View                                     //
////////////////////////////////////////////////////////////////////////////////   

	module.tools.EventListItemWidget = module.ui.ListItemWidget.extend({
		init: function(eventsPanel) {
			this.eventsPanel = eventsPanel;
			this.subList = null;
			this.children = [];
			this._super();
		},
		
		layout: function() {
			this.container = jQuery('<div class="msgEdtListItm"></div>');
			this.title = jQuery('<span class="msgEdtItemTitle"></span>');
			this.buttonDiv = jQuery('<div class="msgEdtButtons"></div>');
			this.removeBtn = jQuery('<button class="removeBtn" title="Remove">Remove</button>');
			this.editBtn = jQuery('<button class="editBtn" title="Edit">Edit</button>');
			this.chainBtn = jQuery('<button class="chainBtn" title="Chain">Chain</button>');
			this.cloneBtn = jQuery('<button class="cloneBtn" title="Clone">Clone</button>');
			
			this.buttonDiv.append(this.editBtn).append(this.chainBtn)
				.append(this.cloneBtn).append(this.removeBtn);
			this.container.append(this.title).append(this.buttonDiv);
			
			var wgt = this;
		},
	
		setText: function(text) {
			this.title.text(text);
		},
	
		setSubList: function(list) {
			this.subList = list;
			this.getUI().parent().append(this.subList.getUI());
		},
	
		addChild: function(child) {
			this.children.push(child);
		},
	
		removeChild: function(child) {
	        var ndx = this.children.indexOf(child);
	        
	        if (ndx != -1) {
	            this.children.splice(ndx, 1);
	        }
		}
	});

    /*
     * Configuration object for the MessagingView.
     */
    module.tools.MessagingViewDefaults = {
        toolName: 'Behaviors',
        toolTip: 'Behavior Editing: Create and edit behaviors',
        widgetId: 'messagingBtn',
        listInstructions: "List is empty.  Click 'Create New Behavior' to add to this list."
    };
    
    /**
     * The MessagingView controls the dialog and toolbar widget for the 
     * animation tool.
     * 
     * @param {Object} options configuration options.  Uses 
     *         editor.tools.MessagingViewDefaults as default options
     */
    module.tools.MessagingView = module.tools.ToolView.extend({
		init: function(options) {
	        var newOpts = jQuery.extend({}, module.tools.MessagingViewDefaults, 
				options);
	        this._super(newOpts);
			
			this.triggersTree = module.ui.createTriggersTree();
			this.actionsTree = module.ui.createActionsTree();
			this.chainParent = null;
			
			this.eventList = new module.ui.ListWidget({
				widgetId: 'msgEvtList',
				prefix: 'msgEvt',
				type: module.ui.ListType.UNORDERED
			});
			
			var pnl = this.mainPanel = new module.ui.Component({
				id: 'msgPnl',
				uiFile: 'js/editor/tools/html/messaging.htm',
				immediateLayout: false
			});
					
			this.paramsWgt = new module.ui.ParamWidget({
				containerId: 'msgEdtTargetParams',
				prefix: 'msgEdt'
			});
			
			this.layoutMainPanel();
			
			this.triggersTree.addListener(module.EventTypes.Trees.TreeCreated, 
				function(treeUI) {
					var causeWrapper = pnl.find(TRIGGER_WRAPPER);				
					causeWrapper.append(treeUI);
				});
			this.actionsTree.addListener(module.EventTypes.Trees.TreeCreated, 
				function(treeUI) {
					var effectWrapper = pnl.find(ACTION_WRAPPER);				
					effectWrapper.append(treeUI);
				});
	    },
		
		addTarget: function(target) {
			var pnl = this.mainPanel,
				eventsPanel = pnl.find('#msgEvents'),
				li = new module.tools.EventListItemWidget(eventsPanel),
				editListPnl = pnl.find('#msgEvents .msgColWrapper'),
				editorPnl = pnl.find('#msgEditor'),
				editorNameInput = editorPnl.find('#msgEdtName'),
				view = this;
			
			var lastChild = function(item) {
				if (item.children.length > 0) {
					return lastChild(item.children[item.children.length - 1]);
				}
				else {
					return item;
				}
			};
			
			var unchain = function(item, level) {
				// get children
				var children = item.children;
				
				for (var ndx = 0, len = children.length; ndx < len; ndx++) {
					unchain(children[ndx], level + 1);
				}
				
				item.getUI().data('level', level)
					.find('span').css('paddingLeft', level * 20 + 'px');
			};
			
			if (view.chainParent != null) {
				var level = view.chainParent.data('level') + 1,
					lastItem = lastChild(view.chainParent);
				
				this.eventList.after(li, lastItem);
				li.getUI().data('chainParent', view.chainParent)
					.data('level', level)
					.find('span').css('paddingLeft', level * 20 + 'px');
				
				view.chainParent.addChild(li);
				view.chainParent = null;
			}
			else {
				this.eventList.add(li);
				li.data('level', 0);
			}
			
			li.setId('msgTarget_' + target.dispatchId);
			li.attachObject(target);
			li.setText(target.name);
			
			// now bind the appropriate buttons
			li.title.bind('click', function(evt) {
				view.notifyListeners(module.EventTypes.SelectTarget, {
					target: li.getAttachedObject(),
					edit: false
				});
			});
			
			li.removeBtn.bind('click', function(evt) {
				while (li.children.length > 0) {
					var child = li.children[0];
					unchain(child, 0);
					li.removeChild(child);
				}
				
				// remove from parent
				var par = li.data('chainParent');
				
				if (par != null) {
					par.removeChild(li);
				}
				
				// now notify others
				view.notifyListeners(module.EventTypes.RemoveTarget, 
					li.getAttachedObject());
			});
				
			li.editBtn.bind('click', function(evt) {
				var target = li.getAttachedObject();
				view.notifyListeners(module.EventTypes.SelectTarget, {
					target: target,
					edit: true
				});
				
				editListPnl.hide();
				editorNameInput.val(target.name);
				view.updateSaveButton();
				editorPnl.show();
			});
			
			var handler = target.handler,
				method = target.func;
			
			if (handler instanceof hemi.handlers.ValueCheck) {
				method = handler.func;
				handler = handler.handler;
			}
			
			var msgs = this.getChainMessages(handler, method);
			
			if (msgs.length > 0) {
				li.chainBtn.data('chainMsgs', msgs)
				.bind('click', function(evt){
					var target = li.getAttachedObject(),
						handler = target.handler,
						messages = jQuery(this).data('chainMsgs');
					
					if (handler instanceof hemi.handlers.ValueCheck) {
						target = handler;
						handler = target.handler;
					}
					
					// special case
					if (target.func === 'moveToView') {
						handler = module.treeData.createCamMoveCitizen(hemi.world.camera);
						messages = [parseInt(target.args[0].replace(
							hemi.dispatch.ID_ARG, ''))];
					}
					view.restrictSelection(view.triggersTree.tree, handler, 
						messages);
					view.chainParent = li;
					view.notifyListeners(module.EventTypes.SelectTrigger, {
						source: handler,
						message: messages[0]
					});
					
					editListPnl.hide();
					editorPnl.show();
				});
			} else {
				li.chainBtn.attr('disabled', 'disabled');
			}
			
			li.cloneBtn.bind('click', function(evt) {
				var target = li.getAttachedObject();
				
				view.notifyListeners(module.EventTypes.SelectTarget, {
					target: target,
					edit: false
				});
				
				view.chainParent = li.data('chainParent');
				view.notifyListeners(module.EventTypes.SaveTarget, 
					'Copy of ' + target.name);
			});
		},
		
		getChainMessages: function(citizen, method) {
			var type = citizen.getCitizenType ? citizen.getCitizenType() : citizen.name,
				key = type + '_' + method,
				msgList = module.treeData.chainTable.get(key),
				messages;
			
			if (citizen.parent != null) {
				messages = this.getChainMessages(citizen.parent, method);
			} else {
				messages = [];
			}
			
			if (msgList !== null) {
				messages = messages.concat(msgList);
			}
			
			return messages;
		},
		
		layoutMainPanel: function() {
			var pnl = this.mainPanel,
				evtLst = this.eventList,
				view = this;
				
			pnl.finishLayout = function() {
				var editListPnl = pnl.find('#msgEvents .msgColWrapper'),
					editorPnl = pnl.find('#msgEditor'),
					editorForm = editorPnl.find('form'),
					editorNameInput = editorPnl.find('#msgEdtName'),
					editorSaveBtn = editorPnl.find('#msgEdtSaveBtn'),
					editorCancelBtn = editorPnl.find('#msgEdtCancelBtn'),
					addBtn = pnl.find('#msgAddEventBtn'),
					replacementPnl = jQuery('#o3d'),
					list = pnl.find('#msgEdtTargetParamsList'),
					panelUI = pnl.getUI();
				
				list.append(view.paramsWgt.getUI());
				
				editListPnl.append(evtLst.getUI());
				editorForm.bind('submit', function(evt) {
					return false;
				});
				
				addBtn.bind('click', function(evt) {
					editListPnl.hide();
					editorPnl.show();
					view.notifyListeners(module.EventTypes.SelectTarget, {
						target: null,
						edit: false
					});
				});
				
				editorNameInput.bind('keyup', function(evt) {
					view.updateSaveButton();
				});
				
				editorSaveBtn.bind('click', function(evt) {
					if (view.chainParent != null) {
						var li = view.chainParent,
							target = li.getAttachedObject(),
							handler = target.handler,
							messages = li.chainBtn.data('chainMsgs');
						
						if (handler instanceof hemi.handlers.ValueCheck) {
							target = handler;
							handler = target.handler;
						}
						
						// special case
						if (target.func === 'moveToView') {
							handler = module.treeData.createCamMoveCitizen(hemi.world.camera);
							messages = [parseInt(target.args[0].replace(
								hemi.dispatch.ID_ARG, ''))];
						}
						
						view.unrestrictSelection(view.triggersTree.tree, 
							handler, messages);
					}
					
					view.notifyListeners(module.EventTypes.SaveTarget, 
						editorNameInput.val());
					editorNameInput.val('');
				});
				
				editorCancelBtn.bind('click', function(evt) {
					if (view.chainParent != null) {
						var li = view.chainParent,
							target = li.getAttachedObject(),
							handler = target.handler,
							messages = li.chainBtn.data('chainMsgs');
						
						if (handler instanceof hemi.handlers.ValueCheck) {
							target = handler;
							handler = target.handler;
						}
						
						// special case
						if (target.func === 'moveToView') {
							handler = module.treeData.createCamMoveCitizen(hemi.world.camera);
							messages = [parseInt(target.args[0].replace(
								hemi.dispatch.ID_ARG, ''))];
						}
						
						view.unrestrictSelection(view.triggersTree.tree, 
							handler, messages);
						view.chainParent = null;
					}
					
					editorPnl.hide();
					editorNameInput.val('');
					editListPnl.show();
				});
				
				panelUI.bind('editor.mainView.resize', function(evt) {
					var height = panelUI.height(),
						columns = panelUI.find('.msgColumn'),
						containers = columns.find('.msgColWrapper'),
						headerHeight = panelUI.find('.msgColTitle').first().outerHeight();
						
					columns.height(height);
					containers.height(height - headerHeight);
				});
				
				replacementPnl.after(panelUI);
			};
			
			pnl.layout();
		},
		
		removeTarget: function(target) {
			this.eventList.remove('msgTarget_' + target.dispatchId);
		},
		
		restrictSelection: function(tree, citizen, msgs) {
			tree.addClass('restricted');
			
			for (var ndx = 0, len = msgs.length; ndx < len; ndx++) {
				var id = citizen.getId ? citizen.getId() : null,
					nodeName = module.treeData.getNodeName(citizen, {
						option: msgs[ndx],
						prefix: module.treeData.TRIGGER_PREFIX,
						id: id
					}),
					node = jQuery('#' + nodeName);
				
				node.find('a').addClass('restrictedSelectable');
			}
		},
		
		unrestrictSelection: function(tree, citizen, msgs) {
			tree.removeClass('restricted');
			
			for (var ndx = 0, len = msgs.length; ndx < len; ndx++) {
				var id = citizen.getId ? citizen.getId() : null,
					nodeName = module.treeData.getNodeName(citizen, {
						option: msgs[ndx],
						prefix: module.treeData.TRIGGER_PREFIX,
						id: id
					}),
					node = jQuery('#' + nodeName);
				
				node.find('a').removeClass('restrictedSelectable');
			}
		},
		
		updateSaveButton: function() {
			var saveButton = this.mainPanel.find('#msgEdtSaveBtn'),
				causeText = this.mainPanel.find('#msgEdtCauseTxt').text(),
				effectText = this.mainPanel.find('#msgEdtEffectTxt').text(),
				name = this.mainPanel.find('#msgEdtName').val();
			
			if (name === '' || causeText === '' || effectText === '') {
				saveButton.attr('disabled', 'disabled');
			} else {
				saveButton.removeAttr('disabled');
			}
		},
		
		updateTarget: function(target) {
			this.eventList.edit(
				'msgTarget_' + target.dispatchId,
				target,
				target.name);
		}
	});
	
////////////////////////////////////////////////////////////////////////////////
//                                Controller                                  //
////////////////////////////////////////////////////////////////////////////////

    /**
     * The MessagingController facilitates MessagingModel and MessagingView
     * communication by binding event and message handlers.
     */
    module.tools.MessagingController = module.tools.ToolController.extend({
		init: function() {
			this._super();
    	},
    
		/**
	     * Binds event and message handlers to the view and model this object 
	     * references.  
	     */        
		bindEvents: function(){
			this._super();
			
			var model = this.model,
				view = this.view,
				bhvWgt = module.ui.getBehaviorWidget(),
				controller = this;
			
			// view specific
			view.addListener(module.EventTypes.ToolModeSet, function(data){
				var isDown = data.newMode === module.tools.ToolConstants.MODE_DOWN, 
					pnl = jQuery('#o3d'), 
					vwr = view.mainPanel.getUI(), 
					columns = vwr.find('.msgColumn');
				view.mainPanel.setVisible(isDown);
				
				if (isDown) {
					pnl.removeClass('mainView').addClass('hiddenView');
					vwr.addClass('mainView').removeClass('hiddenView');
					view.getSidebar().setVisible(false);
				}
				else {
					pnl.addClass('mainView').removeClass('hiddenView');
					vwr.removeClass('mainView').addClass('hiddenView');
					view.getSidebar().setVisible(true);
				}
				
				vwr.bind('editor.mainView.resize', function(evt) {
					var vwrCols = vwr.children('.msgColumn'),
						width = vwr.parent().width(),
						borderWidth = 0,
						paddingWidth = 0,
						marginWidth = 0,
						colWidth = 0;
					
					vwrCols.each(function(index) {
						var elem = jQuery(this);
						
						borderWidth += Math.ceil(parseFloat(elem.css('borderLeftWidth')))
							+ Math.ceil(parseFloat(elem.css('borderRightWidth')));
						paddingWidth += Math.ceil(parseFloat(elem.css('paddingLeft')))
							+ Math.ceil(parseFloat(elem.css('paddingRight')));
						marginWidth += Math.ceil(parseFloat(elem.css('marginLeft')))
							+ Math.ceil(parseFloat(elem.css('marginRight')));
					});
					
					colWidth = (width - borderWidth - marginWidth 
						- paddingWidth) / vwrCols.length;
					
					vwrCols.width(colWidth);
				});
				
				jQuery(window).trigger('resize');
			});			
			view.addListener(module.EventTypes.RemoveTarget, function(data){
				model.removeTarget(data);
			});			
			view.addListener(module.EventTypes.SaveTarget, function(targetName){
				model.save(targetName);
			});			
			view.addListener(module.EventTypes.SelectTarget, function(data){
				if (data.target !== null) {
					model.copyTarget(data.target);
				}
				
				model.msgTarget = data.edit ? data.target : null;
			});			
			
			// view trees specific
			view.actionsTree.addListener(module.EventTypes.Trees.SelectAction, 
				function(data){
					model.setMessageHandler(data.citizen);
					model.setMethod(data.method);
				});			
			view.triggersTree.addListener(module.EventTypes.Trees.SelectTrigger, 
				function(data){
					model.setMessageSource(data.source);
					model.setMessageType(data.message);
				});
			view.paramsWgt.addListener(module.EventTypes.Params.SetArgument, 
				function(data){
					model.setArgument(data.name, data.value);
				});
			
			// model specific
			model.addListener(module.EventTypes.ArgumentSet, function(data){
				view.paramsWgt.setArgument(data.name, data.value);
			});			
			model.addListener(module.EventTypes.TriggerSet, function(data){
				view.triggersTree.select(data);
				view.updateSaveButton();
			});			
			model.addListener(module.EventTypes.ActionSet, function(data){
				var args = [],
					vals = [];
					
				view.actionsTree.select(data);
				view.updateSaveButton();
				model.args.each(function(key, value) {
					args[value.ndx] = key;
					vals[value.ndx] = value.value;
				});
				view.paramsWgt.fillParams(args, vals);
			});			
			model.addListener(module.EventTypes.TargetCreated, function(target){
				view.addTarget(target);
				var editorPnl = view.mainPanel.find('#msgEditor'), 
					editListPnl = view.mainPanel.find('#msgEvents .msgColWrapper');
				
				editorPnl.hide();
				editListPnl.show();
				
				// update the behavior widget
				var spec = model.dispatchProxy.getTargetSpec(target),
					actor = hemi.world.getCitizenById(spec.src),
					msg = spec.msg,
					li = module.ui.getBehaviorListItem(actor);
					
				if (li) {
					li.add(target, actor, msg);
				}
			});			
			model.addListener(module.EventTypes.TargetRemoved, function(data){
				view.removeTarget(data.target);
				
				var li = module.ui.getBehaviorListItem(data.source);
				
				if (li) {
					li.remove(data.target);
				}
			});			
			model.addListener(module.EventTypes.TargetUpdated, function(target){
				view.updateTarget(target);
				var editorPnl = view.mainPanel.find('#msgEditor'), 
					editListPnl = view.mainPanel.find('#msgEvents .msgColWrapper');
				
				editorPnl.hide();
				editListPnl.show();
				
				var spec = model.dispatchProxy.getTargetSpec(target),
					actor = hemi.world.getCitizenById(spec.src),
					msg = spec.msg,
					li = module.ui.getBehaviorListItem(actor);
				
				if (li) {
					li.update(target, actor, msg);
				}
			});
			
			// behavior widget specific
			module.ui.addBehaviorListItemListener(
				module.EventTypes.Behavior.ListItemEdit, function(obj) {
					var spec = model.dispatchProxy.getTargetSpec(obj.target);
						
					bhvWgt.setActor(obj.actor, obj.target.type, obj.target, 
						spec.msg);
					bhvWgt.setVisible(true);
				});
			module.ui.addBehaviorListItemListener(
				module.EventTypes.Behavior.ListItemRemove, function(target) {
					model.removeTarget(target);
				});
			bhvWgt.addListener(module.EventTypes.Behavior.Save, function(saveObj) {
				var args = saveObj.args || [],
					trigger = saveObj.trigger,
					action = saveObj.action;
				
				model.setMessageSource(trigger.citizen);
				model.setMessageType(trigger.type);
				model.setMessageHandler(action.handler);
				model.setMethod(action.method);
				
				for (var ndx = 0, len = args.length; ndx < len; ndx++) {
					var arg = args[ndx];
					
					model.setArgument(arg.name, arg.value);
				}
				
				model.save(saveObj.name, saveObj.type);
			});
			bhvWgt.addListener(module.EventTypes.Behavior.Update, function(saveObj) {				
				if (saveObj.target !== null) {
					model.copyTarget(saveObj.target);
				}
				
				model.msgTarget = saveObj.target;
				
				var args = saveObj.args || [],
					trigger = saveObj.trigger,
					action = saveObj.action;
				
				model.setMessageSource(trigger.citizen);
				model.setMessageType(trigger.type);
				model.setMessageHandler(action.handler);
				model.setMethod(action.method);
				
				for (var ndx = 0, len = args.length; ndx < len; ndx++) {
					var arg = args[ndx];
					
					model.setArgument(arg.name, arg.value);
				}
				
				model.save(saveObj.name, saveObj.type);
			});
		}
	});
	
    return module;
})(editor || {});