// cssfn:
import { parseSelectors, flatMapSelectors, selectorsToString, } from '@cssfn/css-selector';
const getOptions = (rule, container, optionsCache) => {
    if (optionsCache)
        return { ...optionsCache, index: optionsCache.index + 1 }; // increase the index from cache
    let nestingLevel = rule.options?.nestingLevel;
    nestingLevel = (nestingLevel ?? 0) + 1;
    const options = {
        ...rule.options,
        nestingLevel,
        index: container.indexOf(rule) + 1,
    };
    delete options.name;
    return options;
};
const combineSelector = (parentSelector, nestedSelector) => {
    const parentSelectors = parentSelector ? parseSelectors(parentSelector) : [[]];
    if (!parentSelectors)
        return null; // parsing error => invalid selector
    const nestedSelectors = parseSelectors(nestedSelector);
    if (!nestedSelectors)
        return null; // parsing error => invalid selector
    const combinedSelectors = (parentSelectors
        .flatMap((parentSelector) => flatMapSelectors(nestedSelectors, (selector) => {
        const [
        /*
            selector types:
            '&'  = parent         selector
            '*'  = universal      selector
            '['  = attribute      selector
            ''   = element        selector
            '#'  = ID             selector
            '.'  = class          selector
            ':'  = pseudo class   selector
            '::' = pseudo element selector
        */
        selectorType,
        /*
            selector name:
            string = the name of [element, ID, class, pseudo class, pseudo element] selector
        */
        // selectorName,
        /*
            selector parameter(s):
            string       = the parameter of pseudo class selector, eg: nth-child(2n+3) => '2n+3'
            array        = [name, operator, value, options] of attribute selector, eg: [data-msg*="you & me" i] => ['data-msg', '*=', 'you & me', 'i']
            SelectorList = nested selector(s) of pseudo class [:is(...), :where(...), :not(...)]
        */
        // selectorParams,
        ] = selector;
        // we're only interested of selector type '&'
        // replace selector type of `&` with `parentSelector`:
        if (selectorType === '&')
            return parentSelector;
        // preserve the another selector types:
        return selector;
    })));
    // convert back the parsed_object_tree to string:
    return selectorsToString(combinedSelectors);
};
const onProcessStyle = (style, rule, sheet) => {
    if (rule.type !== 'style')
        return style;
    const styleRule = rule;
    const container = styleRule.options.parent;
    let optionsCache = null;
    for (const [nestedSelector, nestedStyle] of Object.entries(style)) {
        const isNestedConditional = ((nestedSelector[0] === '@') && !['@font-face', '@keyframes'].includes(nestedSelector));
        const isNested = !isNestedConditional && nestedSelector.includes('&');
        if (!isNestedConditional && !isNested)
            continue;
        const parentSelector = styleRule.selector;
        optionsCache = getOptions(styleRule, container, optionsCache);
        if (isNestedConditional) {
            // place conditional right after the parent rule to ensure right ordering:
            container
                .addRule(nestedSelector, { /* empty style */}, optionsCache)
                .addRule(styleRule.key, nestedStyle, { selector: parentSelector });
        } // if isNestedConditional
        else if (isNested) {
            const selector = combineSelector(parentSelector, nestedSelector);
            if (selector) {
                container
                    .addRule(selector, nestedStyle, { ...optionsCache, selector });
            } // if
        } // if isNested
        // nested style has been flattened => delete the nested:
        delete style[nestedSelector];
    } // for
    // return the modified style:
    return style;
};
export default function pluginNested() {
    return {
        onProcessStyle,
    };
}
