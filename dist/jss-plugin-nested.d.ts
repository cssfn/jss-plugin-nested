import { Plugin, JssStyle as Style } from 'jss';
import type { OptionalOrFalse, ProductOrFactoryOrDeepArray } from '@cssfn/types';
export declare type StyleCollection = ProductOrFactoryOrDeepArray<OptionalOrFalse<Style>>;
export declare type MergeStylesCallback = (styles: StyleCollection) => Style | null;
export default function pluginNested(mergeStyles: MergeStylesCallback): Plugin;
