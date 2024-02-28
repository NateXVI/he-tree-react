import "./HeTree.css";
import React, { useEffect, useMemo, useState, useRef, ReactNode, useCallback, useImperativeHandle } from "react";
import * as hp from "helper-js";
import { VirtualList, VirtualListHandle } from "./VirtualList";

// types ==================================
export type Id = string | number
export type Checked = boolean | null
export interface Stat<T> {
  id: Id,
  pid: Id | null,
  childIds: Id[],
  siblingIds: Id[],
  index: number,
  level: number,
  node: T,
  parent: T | null,
  parentStat: Stat<T> | null,
  children: T[],
  childStats: Stat<T>[],
  siblings: T[],
  siblingStats: Stat<T>[],
  _isStat?: boolean,
  open: boolean,
  checked: Checked,
  draggable: boolean,
}

export type NodeAttrs = { 'data-key': string, 'data-level': string, 'data-node-box': boolean, 'data-drag-placeholder'?: boolean } & React.HTMLProps<HTMLDivElement>

// single instance ==================================
const dragOverInfo = {
  id: null as any,
  x: 0,
  y: 0,
  time: 0,
}

// react hooks ==================================
export const defaultProps = {
  /**
   * 
   */
  idKey: 'id',
  parentIdKey: 'parent_id',
  childrenKey: 'children',
  indent: 20,
  dragOpen: false,
  dragOpenDelay: 600,
  placeholderId: '__DRAG_PLACEHOLDER__',
  dataType: 'flat' as 'tree' | 'flat',
  rootId: null as any,
}

export interface HeTreeProps<T extends Record<string, any>> extends Partial<typeof defaultProps> {
  data: T[],
  isFunctionReactive?: boolean,
  renderNode?: (stat: Stat<T>) => ReactNode,
  renderNodeBox?: (info: { stat: Stat<T>, attrs: NodeAttrs, isPlaceholder: boolean }) => ReactNode,
  canDrag?: (stat: Stat<T>) => boolean | null | undefined | void,
  canDrop?: (stat: Stat<T>, index?: number) => boolean | null | undefined | void,
  canDropToRoot?: (index?: number) => boolean,
  customDragImage?: (e: React.DragEvent<HTMLElement>, stat: Stat<T>) => void,
  onDragStart?: (e: React.DragEvent<HTMLElement>, stat: Stat<T>) => void,
  onDragOver?: (e: React.DragEvent<HTMLElement>, stat: Stat<T>, isExternal: boolean) => void,
  onExternalDrag?: (e: React.DragEvent<HTMLElement>) => boolean,
  onDrop?: (e: React.DragEvent<HTMLElement>, parentStat: Stat<T> | null, index: number, isExternal: boolean) => boolean | void,
  onDragEnd?: (e: React.DragEvent<HTMLElement>, stat: Stat<T>, isOutside: boolean) => void,
  onChange: (data: T[]) => void,
  openIds?: Id[],
  checkedIds?: Id[],
  semiCheckedIds?: Id[],
}

export function useHeTree<T extends Record<string, any>>(
  props0: HeTreeProps<T>
) {
  const props = { ...defaultProps, ...props0 }
  const { idKey: ID, parentIdKey: PID, childrenKey: CHILDREN, placeholderId, isFunctionReactive, } = props
  const flatOpt = { idKey: ID, parentIdKey: PID } // shared options for flat data
  if (!props.renderNode && !props.renderNodeBox) {
    throw new Error("Either renderNodeBox or renderNode is required.");
  }
  const openIdsStr = useMemo(() => props.openIds ? [...props.openIds].sort().toString() : '', [props.openIds])
  const openIdSet = useMemo(() => new Set(props.openIds), [openIdsStr])
  const checkedIdsStr = useMemo(() => props.checkedIds ? [...props.checkedIds].sort().toString() : '', [props.checkedIds])
  const checkedIdSet = useMemo(() => new Set(props.checkedIds), [checkedIdsStr])
  const semiCheckedIdStr = useMemo(() => props.semiCheckedIds ? [...props.semiCheckedIds].sort().toString() : '', [props.semiCheckedIds])
  const semiCheckedIdSet = useMemo(() => new Set(props.semiCheckedIds), [semiCheckedIdStr])
  // mainCache ==================================
  const mainCache = useMemo(
    () => {
      const stats: Record<Id, Stat<T>> = {} // You can't get ordered values from an object. Because Chrome doesn't support it. https://segmentfault.com/a/1190000018306931
      const nodes: Record<Id, T> = {}
      const rootIds: Id[] = []
      const rootNodes: T[] = []
      const rootStats: Stat<T>[] = []
      // 
      function* simpleWalk(): Generator<T> {
        if (props.dataType === 'flat') {
          for (const node of props.data) {
            yield node
          }
        } else {
          for (const [node] of walkTreeDataGenerator(props.data, CHILDREN)) {
            yield node
          }
        }
      }
      let count = 0
      for (const node of simpleWalk()) {
        const id: Id = node[ID] ?? count
        const pid = node[PID] as Id
        const parent = nodes[pid] || null
        const parentStat = stats[pid] || null;
        const childIds: Id[] = []
        const children: T[] = []
        const childStats: Stat<T>[] = []
        let siblingIds: Id[], siblings: T[], siblingStats: Stat<T>[];
        if (!parentStat) {
          siblingIds = rootIds
          siblings = rootNodes
          siblingStats = rootStats
        } else {
          siblingIds = parentStat.childIds
          siblings = parentStat.children
          siblingStats = parentStat.childStats
        }
        const index = siblingIds.length
        const level = parentStat?.level + 1 || 1
        const stat = {
          _isStat: true,
          id,
          pid,
          childIds,
          siblingIds,
          node,
          parent,
          parentStat,
          children,
          childStats,
          siblings,
          siblingStats,
          index,
          level,
          open: props.openIds ? openIdSet.has(id) : true,
          checked: checkedIdSet.has(id) ? true : (semiCheckedIdSet.has(id) ? null : false),
          draggable: false,
        }
        stats[id] = stat
        nodes[id] = node
        siblingIds.push(id)
        siblings.push(node)
        siblingStats.push(stat)
        count++
      }

      // after stats ready
      for (const [stat] of walkTreeDataGenerator(rootStats, 'childStats')) {
        // draggable
        let draggable = props.canDrag?.(stat) ?? null
        if (draggable === null) {
          draggable = stat.parentStat ? stat.parentStat.draggable : true
        }
        stat.draggable = draggable
      }
      const getStat = (idOrNodeOrStat: T | Stat<T> | Id) => {
        let id: Id
        if (typeof idOrNodeOrStat === 'object') {
          // @ts-ignore
          id = idOrNodeOrStat._isStat ? idOrNodeOrStat.id : idOrNodeOrStat[ID]
        } else {
          id = idOrNodeOrStat
        }
        return stats[id]
      }
      return {
        // root
        rootIds, rootNodes, rootStats,
        // methods
        getStat,
      }
    }, [props.data, props.dataType, ID, PID, openIdSet, checkedIdSet, props.rootId,
    isFunctionReactive && props.canDrag,
  ]
  );
  const { rootIds, rootStats, getStat, } = mainCache;
  // about drag ==================================
  const indent = props.indent!
  const [draggedStat, setDraggedStat] = useState<Stat<T>>();
  const [dragOverStat, setDragOverStat] = useState<Stat<T>>();
  const virtualList = useRef<VirtualListHandle>(null);
  const [placeholder, setPlaceholder] = useState<{ parentStat: Stat<T> | null, level: number, index: number, height: number } | null>();
  const isExternal = !draggedStat
  const cacheForVisible = useMemo(
    () => {
      const visibleIds: Id[] = []
      const attrsList: NodeAttrs[] = [];
      for (const [stat, { skipChildren }] of walkTreeDataGenerator(rootStats, 'childStats')) {
        const attr = createAttrs(stat)
        if (stat === draggedStat) {
          // hide dragged node but don't remove it. Because dragend event won't be triggered if without it.
          Object.assign(attr.style!, {
            position: 'fixed',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            zIndex: '-999999999',
            visibility: 'hidden',
          })
        }
        attrsList.push(attr)
        visibleIds.push(stat.id)
        if (!stat.open || stat === draggedStat) {
          skipChildren()
        }
      }
      if (placeholder) {
        const toIndexInVisible = (parentStat: Stat<T> | null, index: number) => {
          let find = (parentStat?.childStats || rootStats)[index];
          let finalIndex
          if (find) {
            finalIndex = visibleIds.indexOf(find.id)
          } else {
            const getNext = (stat: Stat<T>) => stat.siblingStats[stat.siblingStats.indexOf(stat) + 1];
            let next
            if (parentStat) {
              for (const stat of walkParentsGenerator(parentStat, 'parentStat', { withSelf: true })) {
                next = getNext(stat);
                if (next) {
                  break;
                }
              }
            }
            if (next) {
              finalIndex = visibleIds.indexOf(next.id)
            } else {
              finalIndex = visibleIds.length
            }
          }
          return finalIndex
        }
        // get placeholder's index in visibleIds
        const indexInVisible = toIndexInVisible(placeholder.parentStat, placeholder.index)
        // 
        visibleIds.splice(indexInVisible, 0, placeholderId)
        // @ts-ignore
        const placeholderAttrs = createAttrs({
          id: placeholderId,
          level: placeholder.level,
        }, true)
        placeholderAttrs['data-drag-placeholder'] = true
        attrsList.splice(indexInVisible, 0, placeholderAttrs)
      }
      function createAttrs(stat: Stat<T>, isPlaceholder = false): typeof attrsList[0] {
        return {
          key: stat.id,
          draggable: stat.draggable,
          style: { paddingLeft: (stat.level - 1) * indent + 'px' },
          'data-key': stat.id + '',
          'data-level': stat.level + '',
          'data-node-box': true,
          onDragStart(e) {
            // @ts-ignore
            if (e._handledByNode) {
              return
            }
            if (isPlaceholder) {
              e.preventDefault() // prevent drag
              return
            }
            // prevent if triggered by nested parent
            const el = e.target as HTMLElement
            if (el.querySelector(`[draggable=true]`)) {
              e.preventDefault() // prevent drag
              return
            }
            // @ts-ignore
            e._handledByNode = true // make parent ignore this event
            // 
            e.dataTransfer!.setData("text", "he-tree"); // set data to work in Chrome Android
            // TODO 拖拽类型识别
            e.dataTransfer!.dropEffect = 'move'
            const nodeBox = hp.findParent(e.target as HTMLElement, (el) => el.hasAttribute('data-node-box'), { withSelf: true })
            if (props.customDragImage) {
              props.customDragImage(e, stat)
            } else {
              // setDragImage
              const node = nodeBox.children[0]
              e.dataTransfer.setDragImage(node, 0, 0);
            }
            setTimeout(() => {
              setDraggedStat(stat)
              setPlaceholder({
                ...placeholder!,
                parentStat: stat.parentStat,
                level: stat.level,
                index: (stat.parentStat?.childIds || rootIds).indexOf(stat.id),
              })
            }, 0)
            props.onDragStart?.(e, stat)
            // listen dragend. dragend only trigger in dragstart window
            const onDragEnd = (e: DragEvent) => {
              // TODO
              window.removeEventListener('dragend', onDragEnd);
            }
            window.addEventListener('dragend', onDragEnd);
          },
          onDragOver(e) {
            if (isExternal && !props.onExternalDrag?.(e)) {
              return
            }
            // @ts-ignore
            e._handledByNode = true // make root ignore this event
            // dragOpen ========================
            const shouldDragOpen = () => {
              if (!props.dragOpen) {
                return false
              }
              if (isPlaceholder) {
                return false
              }
              if (!stat.open) {
                return false
              }
              const refresh = () => Object.assign(dragOverInfo, { id: stat.id, x: e.pageX, y: e.pageY, time: Date.now() })
              if (dragOverInfo.id !== stat.id) {
                refresh()
                return false
              }
              if (calculateDistance(e.pageX, e.pageY, dragOverInfo.x, dragOverInfo.y) > 10) {
                refresh()
                return false
              }
              const now = Date.now()
              if (now - dragOverInfo.time >= props.dragOpenDelay!) {
                return true
              }
            }
            if (shouldDragOpen()) {
              // props.onDragOpen!(stat)
            }
            // dragOpen end ========================
            let t = findClosestAndNext(stat, isPlaceholder)
            const { closest, next } = t

            let { atTop } = t
            const listRoot = virtualList.current!.getRootElement()
            // @ts-ignore
            const nodeBox = hp.findParent(e.target, (el) => el.hasAttribute('data-node-box'), { withSelf: true })
            // node start position
            const nodeX = nodeBox.getBoundingClientRect().x
            let placeholderLevel = Math.ceil((e.pageX - nodeX) / indent) // use this number to detect placeholder position. >= 0: prepend. < 0: after.}
            placeholderLevel = hp.between(placeholderLevel, 0, (closest?.level || 0) + 1)
            if (!atTop && !isPlaceholder && closest.id === rootIds[0]) {
              // check if at top
              const topNodeElement = listRoot.querySelector(`[data-key="${closest.id}"]`)
              if (topNodeElement) {
                const rect = topNodeElement.getBoundingClientRect()
                atTop = rect.y + rect.height / 2 > e.pageY
              }
            }
            if (atTop) {
              placeholderLevel = 0
            }
            //
            let newPlaceholder: typeof placeholder
            if (atTop) {
              newPlaceholder = {
                ...placeholder!,
                parentStat: null,
                level: 1,
                index: 0,
              }
            } else {
              const parentMinLevel = next ? next.level - 1 : 0
              // find all droppable positions
              const availablePositionsLeft: { parentStat: Stat<T>, index: number }[] = [];
              const availablePositionsRight: typeof availablePositionsLeft = [];
              let cur = closest
              const curLevel = () => cur ? cur.level : 0
              while (curLevel() >= parentMinLevel) {
                const index = getTargetIndex(cur, next)
                if (getDroppable(cur, index)) {
                  (placeholderLevel > curLevel() ? availablePositionsLeft : availablePositionsRight).unshift({
                    parentStat: cur,
                    index,
                  })
                }
                if (!cur) {
                  break
                }
                cur = cur.parentStat!
              }
              let placeholderPosition = hp.arrayLast(availablePositionsLeft)
              if (!placeholderPosition) {
                placeholderPosition = hp.arrayFirst(availablePositionsRight)
              }
              if (placeholderPosition) {
                newPlaceholder = {
                  ...placeholder!,
                  parentStat: placeholderPosition.parentStat,
                  level: (placeholderPosition.parentStat?.level ?? 0) + 1,
                  index: placeholderPosition.index,
                }
              } else {
                // 
              }
            }
            setPlaceholder(newPlaceholder)
            if (newPlaceholder) {
              e.preventDefault(); // call mean droppable
            }
            !isPlaceholder && setDragOverStat(undefined)
            props.onDragOver?.(e, stat, isExternal)
          },
          onDragLeave(e) {
            !isPlaceholder && setDragOverStat(undefined)
          },
        }
      }
      const onDragOverRoot: React.DragEventHandler<HTMLElement> = (e) => {
        // @ts-ignore
        if (e._handledByNode) {
          return
        }
        // ignore if has visible tree node
        if (visibleIds.length > 0) {
          return
        }
        if (isExternal && !props.onExternalDrag?.(e)) {
          return
        }
        if (getDroppable(null, 0)) {
          setPlaceholder({
            ...placeholder!,
            parentStat: null,
            level: 1,
            index: 0,
          })
          e.preventDefault(); // droppable
        }
      }
      const onDropToRoot: React.DragEventHandler<HTMLElement> = (e) => {
        if (isExternal && !props.onExternalDrag?.(e)) {
          return
        }
        let customized = false
        if (placeholder) {
          const { index: targetIndexInSiblings } = placeholder
          if (props.onDrop?.(e, placeholder.parentStat, targetIndexInSiblings, isExternal) === false) {
            customized = true
          }
          if (!customized && !isExternal) {
            // move node
            // const draft = getDraft()
            // let draggedSiblings: T[], targetSiblings: T[]
            // if (!placeholder.parentStat) {
            //   targetSiblings = draft
            // }
            // let draggedNodeDraft: T
            // for (const [node, { siblings }] of walkTreeDataGenerator(draft, CHILDREN)) {
            //   if (node[ID] === draggedStat.id) {
            //     draggedSiblings = siblings
            //     draggedNodeDraft = node
            //   }
            //   if (!targetSiblings! && node[ID] === placeholder.parentStat!.id) {
            //     targetSiblings = node[CHILDREN]
            //   }
            //   if (draggedSiblings! && targetSiblings!) {
            //     break
            //   }
            // }
            // const ds = draggedSiblings!
            // const ts = targetSiblings!
            // const startIndex = ds.findIndex(v => v[ID] === draggedStat.id)
            // let targetIndex = placeholder.index
            // // check index
            // if (ds === ts && placeholder.index > startIndex) {
            //   targetIndex -= 1
            // }
            // // remove from start position
            // ds.splice(startIndex, 1)
            // // move to target position
            // ts.splice(targetIndex, 0, draggedNodeDraft!)
            // props.onChange(nextData())
            if (props.dataType === 'flat') {
              const startIndex = props.data.findIndex(v => v[ID] === draggedStat.id)
              let targetIndexInSiblings = placeholder.index
              if (placeholder.parentStat === draggedStat.parentStat && draggedStat.index < targetIndexInSiblings) {
                targetIndexInSiblings--
              }
              const targetParentId = placeholder.parentStat?.id ?? null
              const newData = [...props.data];
              const removed = removeByIdInFlatData(newData, draggedStat.id, flatOpt)
              const newNode = { ...draggedStat.node, [PID]: targetParentId }
              removed[0] = newNode
              const targetTreeIndex = convertIndexToTreeIndexInFlatData(newData, targetParentId, targetIndexInSiblings, flatOpt)
              newData.splice(targetTreeIndex, 0, ...removed)
              props.onChange!(newData)
            }
          }
        }
        if (!customized) {
          e.preventDefault();
        }
        setDragOverStat(undefined);
        setDraggedStat(undefined);
        setPlaceholder(undefined);
      }
      function getDroppable(stat: Stat<T> | null, index?: number): boolean {
        if (!stat) {
          return props.canDropToRoot?.(index) ?? true
        }
        if (!stat.open) {
          return false
        }
        let droppable = props.canDrop?.(stat, index)
        if (droppable == undefined) {
          droppable = getDroppable(stat.parentStat)
        }
        return droppable
      }
      /**
       * find closest and next node stat
       */
      function findClosestAndNext(stat: Stat<T>, isPlaceholder: boolean) {
        let closest = stat
        let index = visibleIds.indexOf(stat.id) // index of closest node
        let atTop = false
        const isPlaceholderOrDraggedNode = (id: Id) => id === placeholderId || getStat(id) === draggedStat
        const find = (startIndex: number, step: number) => {
          let i = startIndex, cur
          do {
            i += step
            cur = visibleIds[i]
          } while (cur && isPlaceholderOrDraggedNode(cur));
          return { id: cur, i }
        }
        const findAndAssign = (startIndex: number, dir: number) => {
          const t = find(startIndex, dir)
          closest = getStat(t.id)
          index = t.i
        }
        const NEXT = 1, PREV = -1
        if (isPlaceholder) {
          findAndAssign(index, PREV)
          if (!closest) {
            atTop = true
            findAndAssign(-1, NEXT)
          }
        }
        // next
        const next = getStat(find(index, NEXT).id)
        return { closest, atTop, next }
      }
      /**
       * calculate placeholder target index in target parent's children
       */
      function getTargetIndex(targetParentStat: Stat<T> | null, next: Stat<T> | undefined) {
        const siblingStats = targetParentStat ? targetParentStat.childStats : rootStats
        let index = siblingStats.length
        if (next && next.siblingStats === siblingStats) {
          index = siblingStats.indexOf(next)
        }
        return index
      }
      return { visibleIds, attrsList, onDragOverRoot, onDropToRoot }
    }, [mainCache, indent, draggedStat,
    // watch placeholder position
    placeholder?.parentStat, placeholder?.index,
    // watch props
    indent, placeholderId,
    // watch func
    ...([props.canDrop, props.canDropToRoot, props.customDragImage, props.onDragStart, props.onDragOver, props.onExternalDrag, props.onDrop, props.onDragEnd, props.onChange].map(func => isFunctionReactive && func)),
  ])
  const { visibleIds, attrsList, onDragOverRoot, onDropToRoot } = cacheForVisible
  const persistentIndices = useMemo(() => draggedStat ? [visibleIds.indexOf(draggedStat.id)] : [], [draggedStat, visibleIds]);
  // render
  const renderHeTree = useMemo(
    () => {
      let cached: ReactNode
      return () => {
        if (!cached) {
          let renderNodeBox = props.renderNodeBox!
          if (!renderNodeBox) {
            renderNodeBox = ({ stat, attrs, isPlaceholder }) => <div {...attrs}>
              {isPlaceholder ? <div></div> : props.renderNode!(stat)}
            </div>
          }
          // 
          cached = (
            <div className="he-tree" onDragOver={onDragOverRoot} onDrop={onDropToRoot}>
              <VirtualList<Id> ref={virtualList} items={visibleIds} virtual={false} persistentIndices={persistentIndices}
                renderItem={(id, index) => renderNodeBox({
                  stat: getStat(id)!, attrs: attrsList[index], isPlaceholder: id === placeholderId
                })}
              />
            </div>
          )
        }
        return cached
      }
    }, [cacheForVisible.visibleIds,
    isFunctionReactive && props.renderNode,
    isFunctionReactive && props.renderNodeBox,
  ]);

  return {
    ...mainCache,
    // 
    visibleIds, attrsList,
    // ref
    virtualList,
    // drag states
    draggedStat, dragOverStat, placeholder, isExternal,
    // render
    renderHeTree,
  }
}
// react components ==================================
// no components
// utils methods ==================================
// tree data utils methods =============
export type WalkTreeDataYield<T> = [T, {
  parent: T | null, parents: T[], siblings: T[], index: number, skipChildren: VoidFunction, exitWalk: VoidFunction
}]

/**
 * example: walkTreeData(treeData, 'children', (node, info)=> {})
 */
export function walkTreeData<T extends Record<Id, any>>(
  treeData: T[],
  handler: (...args: WalkTreeDataYield<T>) => void,
  childrenKey = 'children',
) {
  for (const t of walkTreeDataGenerator(treeData, childrenKey)) {
    handler(...t)
  }
}

/**
 * example: for (const [node, info] of walkTreeDataGenerator(treeData, 'children')) {...}
 */
export function* walkTreeDataGenerator<T extends Record<Id, any>>(
  treeData: T[],
  childrenKey = 'children',
): Generator<WalkTreeDataYield<T>> {
  let _skipChildren = false
  let _exit = false
  const skipChildren = () => { _skipChildren = true }
  const exitWalk = () => { _exit = true }
  yield* walk(treeData, null, [])
  // @ts-ignore
  function* walk(arr: T[], parent: T | null, parents: T[]) {
    let index = 0
    for (const node of arr) {
      const siblings = arr
      yield [node, { parent, parents, siblings, index, skipChildren, exitWalk }]
      if (_exit) {
        return
      }
      index++
      if (_skipChildren) {
        _skipChildren = false
      } else {
        // @ts-ignore
        const children: T[] = node[childrenKey]
        if (children) {
          yield* walk(children, node, [...parents, node])
          if (_exit) {
            return
          }
        }
      }
    }
  }
}
export function findTreeData<T extends Record<Id, any>>(
  treeData: T[],
  handler: (...args: WalkTreeDataYield<T>) => void | boolean | any,
  childrenKey = 'children',
) {
  for (const t of walkTreeDataGenerator(treeData, childrenKey)) {
    if (handler(...t)) {
      return t[0]
    }
  }
}
export function filterTreeData<T extends Record<Id, any>>(
  treeData: T[],
  handler: (...args: WalkTreeDataYield<T>) => void | boolean | any,
  childrenKey = 'children',
) {
  const r: T[] = [];
  for (const t of walkTreeDataGenerator(treeData, childrenKey)) {
    if (handler(...t)) {
      r.push(t[0])
    }
  }
  return r
}
// specail utils methods =============
export function* walkParentsGenerator<T>(
  node: T,
  parentKeyOrGetter: string | ((node: T) => T | void | undefined | null),
  options = { withSelf: false }
) {
  let cur = node
  while (cur) {
    if (cur !== node || options.withSelf) {
      yield cur
    }
    // @ts-ignore
    cur = typeof parentKeyOrGetter === 'function' ? parentKeyOrGetter(cur) : cur[parentKeyOrGetter];
  }
}
// flat data utils methods =============
export function sortFlatData<T extends Record<string, any>>(data: T[], ID: string, PID: string) {
  const childrenById = new Map<any, T[]>()
  childrenById.set(null, [])
  const rootNodes = childrenById.get(null)!
  for (const v of data) {
    const id = v[ID]
    childrenById.set(id, [])
  }
  for (const v of data) {
    const pid = v[PID]
    const siblings = childrenById.get(pid) || rootNodes
    siblings.push(v)
  }
  function* walkArr(arr: T[]): Generator<T> {
    for (const node of arr) {
      yield node
      const id = node[ID]
      yield* walkArr(childrenById.get(id)!)
    }
  }
  return [...walkArr(rootNodes)]
}

const flatDataDefaultOptions = {
  idKey: 'id',
  parentIdKey: 'parent_id',
}
export type WalkFlatDataYield<T> = [T, {
  parent: T | null, parents: T[], index: number, treeIndex: number, id: Id, pid: Id | null, skipChildren: VoidFunction, exitWalk: VoidFunction
}]
export function* walkFlatDataGenerator<T extends Record<Id, any>>(flatData: T[], options0?: Partial<typeof flatDataDefaultOptions>): Generator<WalkFlatDataYield<T>> {
  const options = { ...flatDataDefaultOptions, ...options0 }
  const { idKey: ID, parentIdKey: PID } = options
  let _skipChildren = false
  let _exit = false
  const skipChildren = () => { _skipChildren = true }
  const exitWalk = () => { _exit = true }
  const nodes: Record<Id, T> = {}
  const stats: Record<Id, WalkFlatDataYield<T>[1]> = {}
  const childIdsById: Record<Id, Id[]> = {}
  const rootIds: Id[] = [];
  let skipIds: Set<Id> | undefined
  let treeIndex = 0
  for (const node of flatData) {
    const id: Id = node[ID];
    const pid: Id = node[PID] ?? null;
    nodes[id] = node;
    const parent = nodes[pid] || null;
    childIdsById[id] = [];
    const siblingIds = parent ? childIdsById[pid] : rootIds;
    const index = siblingIds.length
    siblingIds.push(id);
    const stat = {
      parent,
      parents: parent ? [...stats[pid]!.parents, parent] : [],
      index,
      id,
      pid,
      treeIndex,
      skipChildren,
      exitWalk,
    }
    stats[id] = stat
    let skipped = false
    if (_skipChildren && skipIds) {
      if (skipIds.has(pid)) {
        skipIds.add(id)
        skipped = true
      } else {
        _skipChildren = false
        skipIds = undefined
      }
    }
    if (!skipped) {
      yield [node, stat]
      if (_exit) {
        break
      }
      if (_skipChildren) {
        skipIds = new Set([id])
      }
    }
    treeIndex++
  }
}

export function walkFlatData<T extends Record<Id, any>>(
  flatData: T[],
  handler: (...args: WalkFlatDataYield<T>) => void,
  options?: Partial<typeof flatDataDefaultOptions>
) {
  for (const t of walkFlatDataGenerator(flatData, options)) {
    handler(...t)
  }
}

/**
 * Convert index in sibling to tree index which in flat data.
 * @param flatData 
 * @param parentId null means root
 * @param indexInSiblings null means append to the end of siblings
 * @param options0 
 * @returns tree index
 */
export function convertIndexToTreeIndexInFlatData<T extends Record<Id, any>>(
  flatData: T[],
  parentId: Id | null,
  indexInSiblings: Id | null,
  options0?: Partial<typeof flatDataDefaultOptions>) {
  const options = { ...flatDataDefaultOptions, ...options0 }
  const { idKey: ID, parentIdKey: PID } = options
  let parentFound = false
  let resultIndex = -1
  for (const [node, { treeIndex, skipChildren, index: curNodeIndexInSiblings }] of walkFlatDataGenerator(flatData, options)) {
    if (parentId != null && !parentFound) {
      if (node[ID] === parentId) {
        parentFound = true
      }
    } else {
      if (parentId == null || node[PID] === parentId) {
        // is sibling
        if (indexInSiblings != null && indexInSiblings === curNodeIndexInSiblings) {
          resultIndex = treeIndex
          break
        } else {
          skipChildren()
        }
      } else {
        resultIndex = treeIndex
        break
      }
    }
  }
  if (resultIndex === -1) {
    resultIndex = flatData.length
  }
  return resultIndex
}
export function addToFlatData<T extends Record<Id, any>>(
  flatData: T[],
  newNode: T,
  indexInSiblings: Id | null,
  options0?: Partial<typeof flatDataDefaultOptions>
) {
  const options = { ...flatDataDefaultOptions, ...options0 }
  const { idKey: ID, parentIdKey: PID } = options
  const pid: Id | null = newNode[PID] ?? null;
  const targetIndex = convertIndexToTreeIndexInFlatData(flatData, pid, indexInSiblings, options)
  flatData.splice(targetIndex, 0, newNode)
}
export function removeByIdInFlatData<T extends Record<Id, any>>(
  flatData: T[],
  removeId: Id | null,
  options0?: Partial<typeof flatDataDefaultOptions>
) {
  if (removeId == null) {
    return flatData.splice(0, flatData.length)
  }
  const options = { ...flatDataDefaultOptions, ...options0 }
  const { idKey: ID, parentIdKey: PID } = options
  let startIndex = -1
  let endIndex = -1
  for (const [node, { treeIndex, skipChildren, }] of walkFlatDataGenerator(flatData, options)) {
    if (startIndex === -1) {
      if (node[ID] === removeId) {
        startIndex = treeIndex
        skipChildren()
      }
    } else {
      endIndex = treeIndex
      break
    }
  }
  if (endIndex === -1) {
    endIndex = flatData.length
  }
  if (startIndex === -1) {
    // not found
    return []
  }
  return flatData.splice(startIndex, endIndex - startIndex)
}

// 'open' utils methods =============
export function openParentsInFlatData<T extends Record<Id, any>>(
  flatData: T[],
  openIds: Id[],
  idOrIds: Id | Id[],
  options0?: Partial<typeof flatDataDefaultOptions>
) {
  const options = { ...flatDataDefaultOptions, ...options0 }
  const { idKey: ID, parentIdKey: PID } = options
  const openIdSet = new Set(openIds)
  const idsToOpen = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
  const idsToOpenSet = new Set(idsToOpen)
  if (idsToOpenSet.size > 0) {
    for (const [node, { parents }] of walkFlatDataGenerator(flatData, options)) {
      const id = node[ID];
      if (idsToOpenSet.has(id)) {
        for (const parent of parents) {
          openIdSet.add(parent[ID])
        }
        idsToOpenSet.delete(id)
        if (idsToOpenSet.size === 0) {
          break
        }
      }
    }
  }
  return Array.from(openIdSet).sort()
}
const treeDataDefaultOptions = {
  idKey: 'id',
  childrenKey: 'children',
}
export function openParentsInTreeData<T extends Record<Id, any>>(
  treeData: T[],
  openIds: Id[],
  idOrIds: Id | Id[],
  options0?: Partial<typeof treeDataDefaultOptions>
) {
  const options = { ...treeDataDefaultOptions, ...options0 }
  const { idKey: ID, childrenKey: CHILDREN } = options
  const openIdSet = new Set(openIds)
  const idsToOpen = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
  const idsToOpenSet = new Set(idsToOpen)
  if (idsToOpenSet.size > 0) {
    for (const [node, { parents }] of walkTreeDataGenerator(treeData, options.childrenKey)) {
      const id = node[ID];
      if (idsToOpenSet.has(id)) {
        for (const parent of parents) {
          openIdSet.add(parent[ID])
        }
        idsToOpenSet.delete(id)
        if (idsToOpenSet.size === 0) {
          break
        }
      }
    }
  }
  return Array.from(openIdSet).sort()
}
// 'checked' utils methods =============
export function updateCheckedInFlatData<T extends Record<Id, any>>(
  flatData: T[],
  checkedIds: Id[],
  idOrIds: Id | Id[],
  checked: boolean,
  options?: Partial<typeof flatDataDefaultOptions>
) {
  const checkedIdSet = new Set(checkedIds)
  const idsToUpdate = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
  const all = new Map<Id, Checked>()
  const changedPids = new Set<Id>(idsToUpdate)
  const pidById: Record<Id, Id | null> = {}
  const childIdsById = new Map<Id | null, Id[]>()
  const rootIds: Id[] = [];
  childIdsById.set(null, rootIds)
  for (const [node, { parents, id, pid }] of walkFlatDataGenerator(flatData, options)) {
    pidById[id] = pid
    childIdsById.get(pid)!.push(id)
    childIdsById.set(id, [])
    all.set(id, checkedIdSet.has(id))
    if (changedPids.has(id) || (pid && changedPids.has(pid))) {
      // update self and children
      all.set(id, checked)
      changedPids.add(id)
    }
  }
  // check from root to each nodes
  const walk = (id: Id) => {
    const childIds = childIdsById.get(id)
    if (!childIds || childIds.length === 0) {
      return all.get(id)
    }
    let hasTrue = false
    let hasFalse = false
    let hasNull = false
    for (const childId of childIds) {
      let t = walk(childId)
      if (t === false) {
        hasFalse = true
      } else if (t === null) {
        hasNull = true
        break
      } else {
        hasTrue = true
      }
    }
    let checked: Checked
    if (hasNull) {
      checked = null
    } else if (hasFalse && hasTrue) {
      checked = null
    } else if (hasFalse) {
      checked = false
    } else {
      checked = true
    }
    all.set(id, checked)
    return checked
  }

  for (const id of rootIds) {
    walk(id)
  }
  const newCheckedIds: Id[] = [];
  const semiCheckedIds: Id[] = [];
  all.forEach((v, k) => {
    if (v === true) {
      newCheckedIds.push(k)
    } else if (v === null) {
      semiCheckedIds.push(k)
    }
  })
  return [newCheckedIds.sort(), semiCheckedIds.sort()]
}
export function updateCheckedInTreeData<T extends Record<Id, any>>(
  treeData: T[],
  checkedIds: Id[],
  idOrIds: Id | Id[],
  checked: boolean,
  options0?: Partial<typeof treeDataDefaultOptions>
) {
  const options = { ...treeDataDefaultOptions, ...options0 }
  const { idKey: ID, childrenKey: CHILDREN } = options
  const checkedIdSet = new Set(checkedIds)
  const idsToUpdate = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
  const all = new Map<Id, Checked>()
  const changedPids = new Set<Id>(idsToUpdate)
  const pidById: Record<Id, Id | null> = {}
  const childIdsById = new Map<Id | null, Id[]>()
  childIdsById.set(null, [])
  for (const [node, { parents, parent }] of walkTreeDataGenerator(treeData, CHILDREN)) {
    const id = node[ID];
    const pid = parent?.[ID] ?? null
    pidById[id] = pid
    childIdsById.get(pid)!.push(id)
    childIdsById.set(id, [])
    all.set(id, checkedIdSet.has(id))
    if (changedPids.has(id) || (pid && changedPids.has(pid))) {
      // update self and children
      all.set(id, checked)
      changedPids.add(id)
    }
  }
  // check from root to each nodes
  const walk = (id: Id) => {
    const childIds = childIdsById.get(id)
    if (!childIds || childIds.length === 0) {
      return all.get(id)
    }
    let hasTrue = false
    let hasFalse = false
    let hasNull = false
    for (const childId of childIds) {
      let t = walk(childId)
      if (t === false) {
        hasFalse = true
      } else if (t === null) {
        hasNull = true
        break
      } else {
        hasTrue = true
      }
    }
    let checked: Checked
    if (hasNull) {
      checked = null
    } else if (hasFalse && hasTrue) {
      checked = null
    } else if (hasFalse) {
      checked = false
    } else {
      checked = true
    }
    all.set(id, checked)
    return checked
  }
  for (const node of treeData) {
    walk(node[ID])
  }
  const newCheckedIds: Id[] = [];
  const semiCheckedIds: Id[] = [];
  all.forEach((v, k) => {
    if (v === true) {
      newCheckedIds.push(k)
    } else if (v === null) {
      semiCheckedIds.push(k)
    }
  })
  return [newCheckedIds.sort(), semiCheckedIds.sort()]
}
// private methods
function calculateDistance(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt(Math.pow((x2 - x1), 2) + Math.pow((y2 - y1), 2));
}