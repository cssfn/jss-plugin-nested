// jss:
import { RuleList, toCssValue, } from 'jss'; // base technology of our cssfn components
import { 
// parses:
parseSelectors, 
// creates & tests:
isParentSelector, createSelector, createSelectorList, 
// renders:
selectorsToString, 
// transforms:
flatMapSelectors, } from '@cssfn/css-selector';
// utilities:
const isGlobalRule = (selector) => (selector === '') || (selector === '@global') || selector.startsWith('@global-') || selector.startsWith('@global_');
const isConditionalRule = (selector) => (['@media', '@supports', '@document'].some((at) => selector.startsWith(at)));
const isKeyframesRule = (selector) => selector.startsWith('@keyframes ');
const isFontFace = (selector) => selector.startsWith('@font-face');
const isFallbacks = (selector) => selector.startsWith('@fallbacks');
const ruleGenerateId = (rule, sheet) => rule.name ?? rule.key;
const getOptions = (rule, parentRule, optionsCache) => {
    if (optionsCache)
        return { ...optionsCache, index: optionsCache.index + 1 }; // increase the index from cache
    let nestingLevel = rule.options?.nestingLevel;
    nestingLevel = (nestingLevel ?? 0) + 1;
    const options = {
        ...rule.options,
        nestingLevel,
        index: (parentRule?.indexOf?.(rule) ?? 0) + 1,
        generateId: ruleGenerateId, // do not auto-generate id for @keyframes
    };
    delete options.name;
    return options;
};
const combineSelector = (parentSelector, nestedSelector) => {
    const parentSelectors = (parentSelector
        ?
            parseSelectors(parentSelector)
        :
            createSelectorList(createSelector(...[]) // empty parent selector
            ));
    if (!parentSelectors)
        return null; // parsing error => invalid selector
    const nestedSelectors = parseSelectors(nestedSelector);
    if (!nestedSelectors)
        return null; // parsing error => invalid selector
    const combinedSelectors = (parentSelectors
        .flatMap((parentSelector) => flatMapSelectors(nestedSelectors, (selector) => {
        // we're only interested of ParentSelector
        if (isParentSelector(selector))
            return parentSelector;
        // preserve the another selector types:
        return selector;
    })));
    // convert back the parsed_object_tree to string:
    return selectorsToString(combinedSelectors);
};
// prevents JSS to clone the CSSFN Style
class EmptyStyle {
    constructor(style) {
        if (style)
            Object.assign(this, style);
    }
}
;
const emptyStyle = new EmptyStyle();
Object.seal(emptyStyle);
class NestedRule {
    // unrecognized syntax on lower version of javascript
    // // BaseRule:
    // type        : string  = 'style'    // for satisfying `jss-plugin-nested`
    // key         : string
    // isProcessed : boolean = false      // required to avoid double processed
    // options     : any
    // renderable? : Object|null|void
    // unrecognized syntax on lower version of javascript
    // // ContainerRule:
    // at          = 'sheet'
    // rules       : RuleList
    // unrecognized syntax on lower version of javascript
    // // StyleRule:
    // style       : Style
    // selector    : string|null = null   // for satisfying `jss-plugin-nested`
    constructor(key, style, options) {
        // BaseRule:
        this.type = 'style'; // for satisfying `jss-plugin-nested`
        this.key = key;
        this.isProcessed = false; // required to avoid double processed
        this.options = {
            ...options,
            parent: this, // places the nested style on here
        };
        this.renderable = null;
        // ContainerRule:
        this.at = key;
        this.rules = new RuleList(this.options);
        // StyleRule:
        this.style = style; // the `style` needs to be attached to `NestedRule` for satisfying `onProcessStyle()`
        const { selector, } = options;
        this.selector = selector ?? null;
    }
    indexOf(rule) {
        return this.rules.indexOf(rule);
    }
    getRule(name) {
        return this.rules.get(name);
    }
    addRule(name, style, options) {
        const rule = this.rules.add(name, style, options);
        if (!rule)
            return null;
        this.options.jss.plugins.onProcessRule(rule);
        return rule;
    }
    /**
     * Generates a CSS string.
     */
    toString(options = {}) {
        /*
            ignore (this as any).style
            
            because a conditional rule ('@media', '@supports', '@document') is a top level rule,
            it should not have a `propName: propValue` directly,
            instead it should have a/some nested rule(s)
            
            @media (...) {
                color: 'red'    // never happen => ignore style
                
                :root   { ... } // a nested rule from @global parent
                .parent { ... } // a nested rule from .parent parent
            }
        */
        // if (!(this as any).rules) {
        //     const rules = new RuleList((this as any).options);
        //     for (const [key, frame] of Object.entries((this as any).style)) {
        //         const frameRule = rules.add(key, (frame as Style));
        //         (frameRule as any).selector = key;
        //     } // for
        //     (this as any).rules = rules;
        //     rules.process(); // plugin-nested was already performed but another plugin such as plugin-camel-case might not been performed => re-run the plugins
        // } // if
        const children = this.rules.toString(options);
        if (!children)
            return '';
        const selector = this.selector ?? this.at;
        if (!selector)
            return children;
        return (`${selector} {\n${children}\n}`);
    }
}
class StyleRule extends NestedRule {
    constructor(key, style, options) {
        super(key, style, options);
        this.options.parent = options.sheet; // StyleRule can't be a parent of any (nested) rules, except @fallbacks rule
        const { selector, scoped, sheet, generateId, classes, } = options;
        if (selector || (selector === '')) {
            this.selector = selector ?? null; // for satisfying `jss-plugin-nested`
        }
        else if (scoped !== false) {
            const id = generateId(this, sheet);
            this.id = id;
            this.selector = `.${id}`; // for satisfying `jss-plugin-nested`
            classes[key] = id;
        } // if
    }
    /**
     * Generates a CSS string.
     */
    toString(options = {}) {
        const style = this.style;
        const fallbacks = this.rules.toString(options);
        const children = (Object.entries(style)
            .filter(([, propValue]) => (propValue !== undefined) && (propValue !== null))
            .map(([propName, propValue]) => `${propName}:${toCssValue(propValue, /*ignoreImportant:*/ false)};`).join('\n'));
        if (!children)
            return '';
        const selector = this.selector;
        if (!selector)
            return children;
        return (`${selector} {\n${fallbacks ? `${fallbacks}\n` : ''}${children}\n}`);
    }
}
const onCreateRule = (key, style, options) => {
    if (isGlobalRule(key)) {
        return new NestedRule(key, style ?? {}, { ...options, selector: '' });
    } // if
    if (isConditionalRule(key) || isKeyframesRule(key)) {
        return new NestedRule(key, style ?? {}, options);
    } // if
    if (key[0] !== '@')
        return new StyleRule(key, style ?? {}, options);
    if (isFontFace(key))
        return new StyleRule(key, style ?? {}, { ...options, selector: '@font-face' });
    if (isFallbacks(key))
        return new StyleRule(key, style ?? {}, { ...options, selector: '' });
    return null;
};
const createOnProcessStyle = (mergeStyles) => (style, rule, sheet) => {
    if (!style)
        return {};
    if (rule.type !== 'style')
        return style;
    const styleRule = rule;
    const parentRule = styleRule.options.parent;
    let optionsCache = null;
    for (const [nestedSelector, nestedStyles] of Object.getOwnPropertySymbols(style).map((sym) => [sym, style[sym]])) {
        const nestedSelectorStr = nestedSelector.description ?? '';
        optionsCache = getOptions(styleRule, parentRule, optionsCache);
        if (isConditionalRule(nestedSelectorStr)) {
            const parentSelector = styleRule.selector ?? '';
            /*
                for non-@global parent:
                
                from:
                .parent {                                // parentRule
                    .awesome { fontSize: 'small' }
                    @media (min-width: 1024px) {         // nested conditional
                        .awesome { fontSize: 'large' }   // the nestedStyles
                    }
                }
                
                to:
                .parent {
                    .awesome { fontSize: 'small' }
                }
                @media (min-width: 1024px) {             // move up the nestedSelectorStr
                    .parent {                            // duplicate the parentRule selector
                        .awesome { fontSize: 'large' }   // move the nestedStyles
                    }
                }
                
                
                
                for @global parent:
                
                from:
                @global {                                // parentRule
                    .awesome { fontSize: 'small' }
                    @media (min-width: 1024px) {         // nested conditional
                        .awesome { fontSize: 'large' }   // the nestedStyles
                    }
                }
                
                to:
                @global {
                    .awesome { fontSize: 'small' }
                }
                @media (min-width: 1024px) {             // move up the nestedSelectorStr
                    .awesome { fontSize: 'large' }       // keep the nestedStyles
                }
            */
            const parentKey = styleRule.key ?? '';
            const isGlobalParent = isGlobalRule(parentKey);
            const conditionalRule = parentRule.addRule(// move up the nestedSelectorStr
            nestedSelectorStr, isGlobalParent ? (mergeStyles(nestedStyles) ?? emptyStyle) : emptyStyle, { ...optionsCache, selector: null }); // causes trigger of all plugins
            if (!isGlobalParent) {
                // place conditional right after the parent rule to ensure right ordering:
                conditionalRule.addRule(// duplicate the parentRule selector
                parentKey, mergeStyles(nestedStyles) ?? emptyStyle, // move the nestedStyles
                { ...optionsCache, selector: parentSelector }); // causes trigger of all plugins
            } // if
        }
        else if (nestedSelectorStr.includes('&')) { // nested rules
            const parentSelector = styleRule.selector ?? '';
            const selector = combineSelector(parentSelector, nestedSelectorStr);
            if (selector) {
                parentRule.addRule(selector, mergeStyles(nestedStyles) ?? emptyStyle, { ...optionsCache, selector }); // causes trigger of all plugins
            } // if
        }
        else if (nestedSelectorStr === '@fallbacks') {
            // convert `Symbol('fooClass'): Style` to `fooClass: MergedStyle`
            const fallbacks = (Array.isArray(nestedStyles) ? nestedStyles : [nestedStyles]).flat();
            for (let index = fallbacks.length - 1; index >= 0; index--) {
                const nestedStyle = fallbacks[index];
                styleRule.addRule(nestedSelectorStr, mergeStyles(nestedStyle) ?? emptyStyle, { ...optionsCache, selector: '' }); // causes trigger of all plugins
            } // for
        }
        else if (nestedSelectorStr[0] === '@') {
            // move `@something` to StyleSheet:
            sheet?.addRule(nestedSelectorStr, mergeStyles(nestedStyles) ?? emptyStyle, { ...optionsCache, selector: null }); // causes trigger of all plugins
        }
        else {
            // convert `Symbol('fooClass'): Style` to `fooClass: MergedStyle`
            parentRule.addRule(nestedSelectorStr, mergeStyles(nestedStyles) ?? emptyStyle, { ...optionsCache, selector: nestedSelectorStr }); // causes trigger of all plugins
        } // if
        // nested style has been processed => delete the nested:
        delete style[nestedSelector];
    } // for
    // return the modified style:
    return style;
};
export default function pluginNested(mergeStyles) {
    return {
        onCreateRule,
        onProcessStyle: createOnProcessStyle(mergeStyles),
    };
}
