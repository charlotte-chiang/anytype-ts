import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { RouteComponentProps } from 'react-router';
import { Block, Icon } from 'ts/component';
import { I, Key, Util, dispatcher } from 'ts/lib';
import { observer, inject } from 'mobx-react';
import { throttle } from 'lodash';

interface Props {
	commonStore?: any;
	blockStore?: any;
	editorStore?: any;
	dataset?: any;
	rootId: string;
	container: string;
	addOffsetY: number;
};

const com = require('proto/commands.js');
const Constant = require('json/constant.json');
const $ = require('jquery');
const THROTTLE = 20;

@inject('commonStore')
@inject('editorStore')
@inject('blockStore')
@observer
class EditorPage extends React.Component<Props, {}> {

	_isMounted: boolean = false;
	timeoutHover: number = 0;
	hovered: string =  '';
	hoverDir: number = 0;

	constructor (props: any) {
		super(props);
		
		this.onKeyDown = this.onKeyDown.bind(this);
		this.onKeyUp = this.onKeyUp.bind(this);
		this.onMouseMove = this.onMouseMove.bind(this);
		this.onAdd = this.onAdd.bind(this);
	};

	render () {
		const { blockStore, rootId } = this.props;
		const { blocks } = blockStore;
		const tree = blockStore.prepareTree(rootId, blocks[rootId] || []);
		
		let n = 0;
		
		return (
			<div className="editor">
				<div className="blocks">
					<Icon id="add" className="add" onClick={this.onAdd} />
				
					{tree.map((item: I.Block, i: number) => { 
						n = Util.incrementBlockNumber(item, n);
						return <Block 
							key={item.id} {...item} number={n} index={i}
							{...this.props}
							onKeyDown={throttle((e: any) => { this.onKeyDown(e); }, THROTTLE)} 
							onKeyUp={throttle((e: any) => { this.onKeyUp(e); }, THROTTLE)} 
						/>
					})}
				</div>
			</div>
		);
	};
	
	componentDidMount () {
		this._isMounted = true;
		
		const { blockStore, editorStore, rootId } = this.props;
		const win = $(window);
		
		this.unbind();
		win.on('mousemove.editor', throttle((e: any) => { this.onMouseMove(e); }, THROTTLE));
		
		dispatcher.call('blockOpen', { id: rootId }, (errorCode: any, message: any) => {});
	};
	
	componentDidUpdate () {
		const { blockStore, editorStore, rootId } = this.props;
		const { blocks } = blockStore;
		const { focused } = editorStore;
		
		const focusedBlock = (blocks[rootId] || []).find((it: I.Block) => { return it.id == focused; });
		const firstBlock = (blocks[rootId] || []).find((it: I.Block) => { return it.type == I.BlockType.Text; });
		
		if (!focusedBlock && firstBlock) {
			let text = String(firstBlock.content.text || '');
			let length = text.length;
			
			editorStore.rangeSave(firstBlock.id, { from: length, to: length });
		};
	};
	
	componentWillUnmount () {
		this._isMounted = false;
		
		const { blockStore, rootId } = this.props;
		
		this.unbind();
		
		blockStore.blocksClear(rootId);
		dispatcher.call('blockClose', { id: rootId }, (errorCode: any, message: any) => {});
	};
	
	unbind () {
		$(window).unbind('mousemove.editor');
	};
	
	onMouseMove (e: any) {
		if (!this._isMounted) {
			return;
		};
		
		const { container, addOffsetY } = this.props;
		
		const win = $(window);
		const node = $(ReactDOM.findDOMNode(this));
		const blocks = node.find('.block');
		const containerEl = $(container);
		const rectContainer = (containerEl.get(0) as Element).getBoundingClientRect() as DOMRect;
		const st = win.scrollTop();
		const add = node.find('#add');
		const { pageX, pageY } = e;
		const offset = 100;
		
		let hovered: any = null;
		let rect = { x: 0, y: 0, width: 0, height: 0 };
		
		// Find hovered block by mouse coords
		blocks.each((i: number, item: any) => {
			item = $(item);
			
			let rect = $(item).get(0).getBoundingClientRect() as DOMRect;
			let { x, y, width, height } = rect;
			y += st;

			if ((pageX >= x) && (pageX <= x + width) && (pageY >= y) && (pageY <= y + height)) {
				hovered = item;
			};
		});
		
		if (hovered) {
			rect = (hovered.get(0) as Element).getBoundingClientRect() as DOMRect;
			this.hovered = hovered.data('id');
		};
		
		let { x, y, width, height } = rect;
		y += st;
		
		window.clearTimeout(this.timeoutHover);
		
		if (hovered && (pageX >= x) && (pageX <= x + Constant.size.blockMenu) && (pageY >= offset) && (pageY <= st + rectContainer.height - offset)) {
			this.hoverDir = pageY < (y + height / 2) ? -1 : 1;
			
			add.css({ opacity: 1, left: rect.x - rectContainer.x + 2, top: pageY - 10 + containerEl.scrollTop() + Number(addOffsetY) });
			blocks.addClass('showMenu').removeClass('isAdding top bottom');
			
			if (hovered && (pageX <= x + 20)) {
				hovered.addClass('isAdding ' + (this.hoverDir < 0 ? 'top' : 'bottom'));
			};
		} else {
			this.timeoutHover = window.setTimeout(() => {
				add.css({ opacity: 0 });
				blocks.removeClass('showMenu isAdding top bottom');
			}, 10);
		};
	};
	
	onKeyDown (e: any) {
		const { blockStore, editorStore, commonStore, dataset, rootId } = this.props;
		const { focused, range } = editorStore;
		const { blocks } = blockStore;
		const { selection } = dataset;
		
		const block = blocks[rootId].find((item: I.Block) => { return item.id == focused; });
		if (!block) {
			return;
		};
		
		const index = blocks[rootId].findIndex((item: I.Block) => { return item.id == focused; });
		const { content } = block;

		let l = String(content.text || '').length;
		let k = e.which;
		
		if (
			((range.from == 0) && (k == Key.up)) ||
			((range.to == l) && (k == Key.down))
		) {
			e.preventDefault();
			
			const dir = (k == Key.up) ? -1 : 1;
			const next = blockStore.getNextBlock(rootId, focused, dir);
			
			if (e.shiftKey) {
				if (selection.get().length < 1) {
					window.getSelection().empty();
					selection.set([ focused ]);
					commonStore.menuClose('blockAction');					
				};
			} else {
				if (next && (next.type == I.BlockType.Text)) {
					const l = String(next.content.text || '').length;
					const newRange = (dir > 0 ? { from: 0, to: 0 } : { from: l, to: l });
					
					editorStore.rangeSave(next.id, newRange);
				};
			};
		};
		
		if (k == Key.enter) {
			e.preventDefault();
			
			this.blockCreate(block, 1);
		};
	};
	
	onKeyUp (e: any) {
	};
	
	onAdd (e: any) {
		if (!this.hovered) {
			return;
		};
		
		const { blockStore, editorStore, rootId } = this.props;
		const { blocks } = blockStore;
		
		const block = blocks[rootId].find((item: I.Block) => { return item.id == this.hovered; });
		if (!block) {
			return;
		};
		
		this.blockCreate(block, this.hoverDir);
	};
	
	blockCreate (focused: I.Block, dir: number) {
		const { blockStore, editorStore, rootId } = this.props;
		
		let request = {
			block: blockStore.prepareBlockToProto({
				type: I.BlockType.Text,
				content: {
					style: I.TextStyle.Paragraph,
				},
			}),
			contextId: rootId,
			parentId: focused.parentId || rootId,
			targetId: focused.id,
			position: dir > 0 ? I.BlockPosition.After : I.BlockPosition.Before,
		};
		
		dispatcher.call('blockCreate', request, (errorCode: any, message: any) => {
			editorStore.rangeSave(message.blockId, { from: 0, to: 0 });
		});
	};
	
};

export default EditorPage;