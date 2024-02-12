import "./HeTree.css";
import { useEffect, useMemo, useState, useRef, ReactNode, DragEventHandler } from "react";
import * as hp from "helper-js";
import { VirtualList, VirtualListHandle, OptionalKeys } from "./VirtualList";

export type HeTreeProps = {
  treeData: Record<string, unknown>,
  renderNode: (info: TreeNodeInfo) => ReactNode,
} & OptionalKeys<typeof defaultProps>

export const defaultProps = {
  /**
   * 
   */
  childrenKey: 'children',
  openKey: 'open',
  checkedKey: 'checked',
  foldable: true,
  indent: 20,
}

export type TreeNodeInfo = {
  _isPlaceholder: boolean,
  key: string | number,
  node: Record<string, unknown>,
  parent: Record<string, unknown>,
  children: Record<string, unknown>[],
  level: number,
  dragOvering: boolean,
  _attrs: {
    key: string | number,
    draggable: boolean,
    style: React.CSSProperties,
    onDragStart: DragEventHandler,
    onDragOver: DragEventHandler,
    onDrop: DragEventHandler,
    onDragEnter: DragEventHandler,
    onDragLeave: DragEventHandler,
    'data-key': string | number,
    'data-level': number,
    'drag-placeholder'?: 'true'
  }
} & Record<string, unknown>

export const HeTree = function HeTree(props: HeTreeProps) {
  const CHILDREN = props.childrenKey!
  const OPEN = props.openKey!
  const CHECKED = props.checkedKey!
  const indent = props.indent!
  const [forceRerender, setforceRerender] = useState([]); // change value to force rerender
  const [placeholderArgs, setplaceholderArgs] = useState<{
    _isPlaceholder: boolean,
    key: string,
    node: Record<string, unknown>,
    parent: Record<string, unknown>,
    children: Record<string, unknown>[],
    level: number,
    index: number,
  } | null>();
  const [placeholderExtraInfo, setplaceholderExtraInfo] = useState(); // different with normal node\
  const virtualList = useRef<VirtualListHandle>(null);
  // flat treeData and info
  // info.children does not include placeholder
  const { flatInfos, infoByNodeMap } = useMemo(() => {
    const flat: TreeNodeInfo[] = [];
    const resolveNode = (
      { _isPlaceholder, key, node, parent, children, level, ...others }: {
        _isPlaceholder: boolean,
        key: string | number,
        node: Record<string, unknown>,
        parent: Record<string, unknown>,
        children: Record<string, unknown>[], level: number,
      } & Record<string, unknown>
    ) => {
      _isPlaceholder = Boolean(_isPlaceholder)
      if (key == null) {
        key = Math.random()
      }
      const style = { paddingLeft: (level - 1) * indent + 'px' }
      const onDragStart = (e: DragEvent) => {
        e.dataTransfer!.setData("text", "he-tree"); // set data to work in Chrome Android
        e.dataTransfer!.dropEffect = 'move'
        // TOFO node's 'dragging'
      }
      // main events for drop area
      const onDragOver = (e: DragEvent) => {
        // TODO
        // if (!info.dragOvering) {
        //   return
        // }

        let closest: TreeNodeInfo = info
        let index = flatInfos.indexOf(info) // index of closest node
        let atTop = false
        if (info._isPlaceholder) {
          let i = index - 1
          closest = flatInfos[i]
          if (!closest) {
            atTop = true
            i = index + 1
            closest = flatInfos[i]
          }
          index = i
        }
        const listRoot = virtualList.current!.getRootElement()
        let nodeBoxX = listRoot.getBoundingClientRect().x // TODO, minus padding left
        let placeholderLevel = Math.ceil((e.pageX - nodeBoxX) / indent) // use this number to detect placeholder position. >= 0: prepend. < 0: after.}
        placeholderLevel = hp.between(placeholderLevel, 0, closest.level + 1)
        // @ts-ignore
        if (!atTop && !info._isPlaceholder && closest.node === props.treeData[CHILDREN][0]) {
          // chekc if at top
          const firstNodeElement = listRoot.querySelector(`.tree-node-box[data-key="${closest.key}"]`)!
          const rect = firstNodeElement.getBoundingClientRect()
          atTop = rect.y + rect.height / 2 > e.pageY
        }
        if (atTop) {
          placeholderLevel = 0
        }
        // default args if for 'after' action
        let newPlaceholderArgs: typeof placeholderArgs = {
          _isPlaceholder: true,
          key: '__DRAG_PLACEHOLDER__',
          node: {},
          parent: parent,
          children: [],
          level,
          index: index + 1,
        }
        const isDroppable = (info: TreeNodeInfo) => {
          // TODO
          return true
        }
        const getNextNodeInfo = (indexInTree: number) => {
          let next = flatInfos[indexInTree + 1]
          if (next?._isPlaceholder) {
            next = flatInfos[indexInTree + 2]
          }
          return next
        }
        if (atTop) {
          Object.assign(newPlaceholderArgs, {
            parent: props.treeData,
            level: 1,
            index: 0,
          })
        } else {
          let next = flatInfos[index + 1]
          if (next?._isPlaceholder) {
            next = flatInfos[index + 2]
          }
          const minLevel = next ? next.level : 1
          // TODO 如果closest关闭的，则等待打开，不find availablePositions
          // find all droppable positions
          const availablePositionsLeft: { parentInfo: TreeNodeInfo }[] = [];
          const availablePositionsRight: typeof availablePositionsLeft = [];
          let cur = closest
          while (cur && cur.level >= minLevel - 1) {
            if (isDroppable(cur)) {
              (placeholderLevel > cur.level ? availablePositionsLeft : availablePositionsRight).unshift({
                parentInfo: cur,
              })
            }
            cur = infoByNodeMap.get(cur.parent)
          }
          let placeholderLevelPosition = hp.arrayLast(availablePositionsLeft)
          if (!placeholderLevelPosition) {
            placeholderLevelPosition = hp.arrayFirst(availablePositionsRight)
          }
          if (placeholderLevelPosition) {
            let targetIndex = index + 1
            let oldIndex = placeholderArgs?.index
            if (oldIndex != null && oldIndex < targetIndex) {
              targetIndex--
            }
            Object.assign(newPlaceholderArgs, {
              parent: placeholderLevelPosition.parentInfo.node,
              level: placeholderLevelPosition.parentInfo.level + 1,
              index: targetIndex
            })
          } else {
            newPlaceholderArgs = null
          }
        }
        setplaceholderArgs(newPlaceholderArgs)
        if (newPlaceholderArgs) {
          e.preventDefault(); // call mean droppable
        }
      }
      const onDrop = (e: DragEvent) => {
        e.preventDefault();
      }
      // other events
      const onDragEnter = (e: DragEvent) => {
        info.dragOvering = true
        setforceRerender([])
      }
      const onDragLeave = (e: DragEvent) => {
        info.dragOvering = false
        setforceRerender([])
      }
      const _attrs: TreeNodeInfo['_attrs'] = {
        key, style, draggable: true,
        // @ts-ignore
        onDragStart, onDragOver, onDrop, onDragEnter, onDragLeave,
        // data attrs
        'data-key': key, 'data-level': level
      }
      if (_isPlaceholder) {
        _attrs['drag-placeholder'] = 'true'
      }
      const info = { _isPlaceholder, key, node, parent, children, level, dragOvering: false, _attrs, ...others }
      return info
    }

    let count = -1
    const infoByNodeMap = new Map()
    hp.walkTreeData(
      props.treeData,
      (node, index, parent, path) => {
        // @ts-ignore
        const key: string = node.id || node.key
        const indexInTree = count
        // @ts-ignore
        const children = [];
        // @ts-ignore
        const info: TreeNodeInfo = resolveNode({ key, node, parent, children, level: path.length })
        infoByNodeMap.set(node, info)
        if (count === -1) {
          // root
          // TODO
        } else {
          const parentInfo = infoByNodeMap.get(parent)
          parentInfo.children.push(info)
          flat.push(info)
        }
        count++
      },
      { childrenKey: CHILDREN }
    );
    if (placeholderArgs) {
      const placeholderInfo = resolveNode(placeholderArgs)
      infoByNodeMap.set(placeholderInfo.node, placeholderInfo)
      flat.splice(placeholderArgs.index, 0, placeholderInfo)
    }
    return { flatInfos: flat, infoByNodeMap }
  }, [props.treeData, props.indent, props.foldable, CHILDREN, OPEN, CHECKED, placeholderArgs?.parent, placeholderArgs?.index]);
  const renderPlaceholder = (info: TreeNodeInfo) => {
    return <div className="tree-drag-placeholder" ></div>
  }
  return <VirtualList ref={virtualList} items={flatInfos} virtual={false}
    renderItem={(info, index) => (
      <div className="tree-node-box" {...info._attrs} >
        {!info._isPlaceholder ? props.renderNode(info) : renderPlaceholder(info)}
      </div>
    )}
  />
}

HeTree.defaultProps = defaultProps
