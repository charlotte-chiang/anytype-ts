import { authStore, commonStore, blockStore } from 'ts/store';
import { set } from 'mobx';
import { Util, DataUtil, I, M, Decode, Storage, translate, analytics } from 'ts/lib';
import * as Sentry from '@sentry/browser';

const com = require('proto/commands.js');
const bindings = require('bindings')('addon');
const Constant = require('json/constant.json');

class Dispatcher {

	service: any = null;
	
	constructor () {
		com.anytype.ClientCommands.prototype.rpcCall = this.napiCall;
		this.service = com.anytype.ClientCommands.create(() => {}, false, false);
		
		const handler = (item: any) => {
			try {
				this.event(com.anytype.Event.decode(item.data));
			} catch (e) {
				console.error(e);
			};
		};
		
		bindings.setEventHandler(handler);
	};
	
	event (event: any, skipDebug?: boolean) {
		const rootId = event.contextId;
		const debug = (Storage.get('debug') || {}).mw && !skipDebug;
		
		if (debug) {
			console.log('[Dispatcher.event] rootId', rootId, 'event', JSON.stringify(event, null, 3));
		};

		let parentIds: any = {};
		let childrenIds: any = {};
		
		event.messages.sort(this.sort);
		
		for (let message of event.messages) {
			let type = message.value;
			let data = message[type] || {};
			
			switch (type) {
				case 'blockSetChildrenIds':
					const ids = data.childrenIds || [];
					for (let id of ids) {
						parentIds[id] = data.id;
					};
					if (ids.length) {
						childrenIds[data.id] = ids;
					};
					break;
					
				case 'blockAdd':
					for (let block of data.blocks) {
						const ids = block.childrenIds || [];
						for (let id of ids) {
							parentIds[id] = block.id;
						};
						if (ids.length) {
							childrenIds[block.id] = ids;
						};
					};
					break;
			};
		};
		
		for (let message of event.messages) {
			let block: any = null;
			let type = message.value;
			let data = message[type] || {};
			
			if (data.error && data.error.code) {
				continue;
			};
			
			switch (type) {
				
				case 'accountShow':
					authStore.accountAdd(data.account);
					break;
					
				case 'blockShow':
					let blocks = data.blocks.map((it: any) => {
						it = blockStore.prepareBlockFromProto(it);
						if (it.id == rootId) {
							it.type = I.BlockType.Page;
							it.pageType = Number(data.type) || 0;
						};
						return new M.Block(it);
					});

					block = blocks.find((it: I.Block) => { return it.id == rootId });
					if (!block) {
						break;
					};

					if (block.hasTitle()) {
						block.childrenIds.unshift(rootId + '-title');
						blocks.unshift(new M.Block({ id: rootId + '-title', type: I.BlockType.Title, childrenIds: [], fields: {}, content: {} }));
					};

					blockStore.blocksSet(rootId, blocks);
					blockStore.detailsSet(rootId, data.details);
					break;
				
				case 'blockAdd':
					for (let block of data.blocks) {
						block = blockStore.prepareBlockFromProto(block);
						block.parentId = String(parentIds[block.id] || '');
						
						blockStore.blockAdd(rootId, block, (childrenIds[block.parentId] || []).indexOf(block.id));
					};
					break;
					
				case 'blockDelete':
					for (let blockId of data.blockIds) {
						blockStore.blockDelete(rootId, blockId);
					};
					break;
					
				case 'blockSetChildrenIds':
					block = blockStore.getLeaf(rootId, data.id);
					if (!block) {
						break;
					};

					if (block.hasTitle() && (data.childrenIds.indexOf(rootId + '-title') < 0)) {
						data.childrenIds.unshift(rootId + '-title');
					};

					blockStore.blockUpdateStructure(rootId, data.id, data.childrenIds);
					break;
					
				case 'blockSetDetails':
					blockStore.detailsUpdate(rootId, data, true);
					break;
					
				case 'blockSetFields':
					block = blockStore.getLeaf(rootId, data.id);
					if (!block) {
						break;
					};
					
					if (null !== data.fields) {
						block.fields = Decode.decodeStruct(data.fields);
					};
					
					blockStore.blockUpdate(rootId, block);
					break;
					
				case 'blockSetLink':
					block = blockStore.getLeaf(rootId, data.id);
					if (!block) {
						break;
					};
					
					if (null !== data.fields) {
						block.content.fields = Decode.decodeStruct(data.fields.value);
						block.content.fields.name = String(block.content.fields.name || Constant.default.name);
					};
					
					blockStore.blockUpdate(rootId, block);
					break;
					
				case 'blockSetText':
					block = blockStore.getLeaf(rootId, data.id);
					if (!block) {
						break;
					};
					
					if (null !== data.text) {
						block.content.text = String(data.text.value || '');
					};
					
					if (null !== data.marks) {
						let marks: any = [];
						for (let mark of data.marks.value.marks) {
							marks.push({
								type: Number(mark.type) || 0,
								param: String(mark.param || ''),
								range: {
									from: Number(mark.range.from) || 0,
									to: Number(mark.range.to) || 0,
								}
							});
						};
						block.content.marks = marks;
					};
					
					if (null !== data.style) {
						block.content.style = Number(data.style.value) || 0;
					};
					
					if (null !== data.checked) {
						block.content.checked = Boolean(data.checked.value);
					};
					
					if (null !== data.color) {
						block.content.color = String(data.color.value || '');
					};
					
					blockStore.blockUpdate(rootId, block);
					break;
					
				case 'blockSetDiv':
					block = blockStore.getLeaf(rootId, data.id);
					if (!block) {
						break;
					};
					
					if (null !== data.style) {
						block.content.style = Number(data.style.value) || 0;
					};
					
					blockStore.blockUpdate(rootId, block);
					break;
					
				case 'blockSetFile':
					block = blockStore.getLeaf(rootId, data.id);
					if (!block) {
						break;
					};
					
					if (null !== data.name) {
						block.content.name = String(data.name.value || '');
					};
					
					if (null !== data.hash) {
						block.content.hash = String(data.hash.value || '');
					};
					
					if (null !== data.mime) {
						block.content.mime = String(data.mime.value || '');
					};
					
					if (null !== data.size) {
						block.content.size = Number(data.size.value) || 0;
					};
					
					if (null !== data.type) {
						block.content.type = Number(data.type.value) || 0;
					};
					
					if (null !== data.state) {
						block.content.state = Number(data.state.value) || 0;
					};
					
					blockStore.blockUpdate(rootId, block);
					break;
					
				case 'blockSetBookmark':
					block = blockStore.getLeaf(rootId, data.id);
					if (!block) {
						break;
					};
					
					if (null !== data.url) {
						block.content.url = String(data.url.value || '');
					};
					
					if (null !== data.title) {
						block.content.title = String(data.title.value || '');
					};
					
					if (null !== data.description) {
						block.content.description = String(data.description.value || '');
					};
					
					if (null !== data.imageHash) {
						block.content.imageHash = String(data.imageHash.value || '');
					};
					
					if (null !== data.faviconHash) {
						block.content.faviconHash = String(data.faviconHash.value || '');
					};
					
					if (null !== data.type) {
						block.content.type = Number(data.type.value) || 0;
					};
					break;
					
				case 'blockSetBackgroundColor':
					block = blockStore.getLeaf(rootId, data.id);
					if (!block) {
						break;
					};
					
					block.bgColor = String(data.backgroundColor || '');
					blockStore.blockUpdate(rootId, block);
					break;
					
				case 'blockSetAlign':
					block = blockStore.getLeaf(rootId, data.id);
					if (!block) {
						break;
					};
					
					block.align = Number(data.align) || 0;
					blockStore.blockUpdate(rootId, block);
					break;

				case 'blockSetDataviewView':
					block = blockStore.getLeaf(rootId, data.id);
					if (!block) {
						break;
					};

					const schemaId = DataUtil.schemaField(block.content.schemaURL);
					data.view = blockStore.prepareViewFromProto(schemaId, data.view);
					
					let view = block.content.views.find((it: I.View) => { return it.id == data.view.id });
					if (view) {
						set(view, data.view);
					} else {
						block.content.views.push(data.view);
					};

					blockStore.blockUpdate(rootId, block);
					break;

				case 'processNew':
				case 'processUpdate':
				case 'processDone':
					const type = Number(data.process.type) || 0;
					const state = Number(data.process.state) || 0;
					const status = translate('progress' + type);
					
					switch (state) {
						case I.ProgressState.Running:
						case I.ProgressState.Done:
							commonStore.progressSet({
								id: String(data.process.id || ''),
								status: status,
								current: Number(data.process.progress.done),
								total: Number(data.process.progress.total),
								isUnlocked: true,
								canCancel: true,
							});
							break;
						
						case I.ProgressState.Canceled:
							commonStore.progressClear();
							break;
					};
					break;
			};
		};
		
		blockStore.setNumbers(rootId);
	};
	
	sort (c1, c2) {
		let type1 = c1.value;
		let type2 = c2.value;
			
		if ((type1 == 'blockAdd') && (type2 != 'blockAdd')) {
			return -1;
		};
		if ((type2 == 'blockAdd') && (type1 != 'blockAdd')) {
			return 1;
		};
			
		if ((type1 == 'blockDelete') && (type2 != 'blockDelete')) {
			return -1;
		};
		if ((type2 == 'blockDelete') && (type1 != 'blockDelete')) {
			return 1;
		};
		
		return 0;
	};
	
	public request (type: string, data: any, callBack?: (message: any) => void) {
		if (!this.service[type]) {
			console.error('[Dispatcher.request] Service not found: ', type);
			return;
		};
		
		const debug = (Storage.get('debug') || {}).mw;

		let t0 = 0;
		let t1 = 0;
		let t2 = 0;
		
		if (debug) {
			t0 = performance.now();
			console.log('[Dispatcher.request]', type, JSON.stringify(data, null, 3));
		};
		
		analytics.event(Util.toUpperCamelCase(type), data);
		
		try {
			this.service[type](data, (message: any) => {
				if (debug) {
					t1 = performance.now();
				};
				
				message.error = {
					code: String(message.error.code || ''),
					description: String(message.error.description || ''), 
				};
				
				if (message.error.code) {
					console.error('[Dispatcher.error]', type, 'code:', message.error.code, 'description:', message.error.description);
					Sentry.captureMessage(type + ': ' + message.error.description);
					analytics.event('Error', { cmd: type, code: message.error.code });
				};
				
				if (debug) {
					console.log('[Dispatcher.callback]', type, JSON.stringify(message, null, 3));
				};

				if (message.event) {
					this.event(message.event, true);
				};

				if (callBack) {
					callBack(message);
				};

				if (debug) {
					t2 = performance.now();
					const mt = Math.ceil(t1 - t0);
					const rt = Math.ceil(t2 - t1);
					const tt = Math.ceil(t2 - t0);

					console.log(
						'Middle time:', mt + 'ms', 
						'Render time:', rt + 'ms', 
						'Total time:', tt + 'ms'
					);

					if (mt > 3000) {
						Sentry.captureMessage(`${type}: middleware time too long`);
					};
					if (rt > 1000) {
						Sentry.captureMessage(`${type}: render time too long`);
					};
				};
			});
		} catch (err) {
			console.error(err);
		};
	};
	
	napiCall (method: any, inputObj: any, outputObj: any, request: any, callBack?: (message: any) => void) {
		const buffer = inputObj.encode(request).finish();
		const handler = (item: any) => {
			let message = null;
			try {
				message = outputObj.decode(item.data);
				if (message) {
					callBack(message);
				};
			} catch (err) {
				console.error(err);
			};
		};
		
		bindings.sendCommand(method.name, buffer, handler);
	};
	
};

export let dispatcher = new Dispatcher();