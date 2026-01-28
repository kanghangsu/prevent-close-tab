const { Plugin } = require('obsidian');

class DisableHotkeysPlugin extends Plugin {
    async onload() {
        this.allowContextMenuClose = false;
        
        this.overrideCloseCommand();
        this.registerClickPrevention();
        this.registerContextMenuHandler();
        await this.setupLeafDetachIntercept();
    }
    
    registerContextMenuHandler() {
        this.registerDomEvent(document, 'click', (evt) => {
            const closeMenuItem = evt.target.closest('.menu-item[data-section="close"]');
            if (closeMenuItem) {
                this.allowContextMenuClose = true;
                setTimeout(() => {
                    this.allowContextMenuClose = false;
                }, 300);
            }
        }, { capture: true });
    }
    
    overrideCloseCommand() {
        const commandId = 'workspace:close';
        this.originalCommand = this.app.commands.findCommand(commandId);
        
        if (this.originalCommand) {
            this.app.commands.removeCommand(commandId);
            
            this.app.commands.addCommand({
                id: commandId,
                name: this.originalCommand.name,
                icon: this.originalCommand.icon,
                callback: () => {
                    const activeLeaf = this.app.workspace.activeLeaf;
                    if (!activeLeaf) return;
                    
                    if (this.shouldPreventClose(activeLeaf) && !this.allowContextMenuClose) {
                        return;
                    }
                    
                    activeLeaf.detach();
                },
                hotkeys: this.originalCommand.hotkeys
            });
        }
    }
    
    registerClickPrevention() {
        const handleCloseAttempt = (evt, element) => {
            const tabHeader = element.closest('.workspace-tab-header');
            if (!tabHeader) return;
            
            const isPinned = this.isTabPinned(tabHeader);
            const isInSidebar = this.isTabInSidebar(tabHeader);
            
            if (isPinned || isInSidebar) {
                if (this.allowContextMenuClose) return;
                
                evt.preventDefault();
                evt.stopPropagation();
                evt.stopImmediatePropagation();
                return false;
            }
        };
        
        this.registerDomEvent(document, 'mousedown', (evt) => {
            if (evt.button === 1) {
                const target = evt.target.closest('.workspace-tab-header') || evt.target;
                handleCloseAttempt(evt, target);
            }
        }, { capture: true });
        
        this.registerDomEvent(document, 'click', (evt) => {
            const closeButton = evt.target.closest('.workspace-tab-header-inner-close-button');
            if (closeButton) {
                handleCloseAttempt(evt, closeButton);
            }
        }, { capture: true });
    }
    
    isTabPinned(tabHeader) {
        if (!tabHeader) return false;
        
        const pinIcon = tabHeader.querySelector('.workspace-tab-header-status-icon.mod-pinned');
        const hasPinnedClass = tabHeader.classList.contains('is-pinned');
        
        return !!pinIcon || hasPinnedClass;
    }
    
    isTabInSidebar(element) {
        if (!element) return false;
        
        let current = element;
        while (current) {
            if (current.classList && (
                current.classList.contains('mod-sidedock') || 
                current.classList.contains('mod-left-split') || 
                current.classList.contains('mod-right-split')
            )) {
                return true;
            }
            current = current.parentElement;
        }
        return false;
    }
    
    shouldPreventClose(leaf) {
        if (!leaf) return false;
        
        if (this.allowContextMenuClose) return false;
        
        const viewState = leaf.getViewState ? leaf.getViewState() : {};
        let isPinned = viewState.pinned;
        
        if (!isPinned && leaf.containerEl) {
            const pinIcon = leaf.containerEl.querySelector('.workspace-tab-header-status-icon.mod-pinned');
            isPinned = !!pinIcon;
        }
        
        let isInSidebar = false;
        if (leaf.containerEl) {
            isInSidebar = this.isTabInSidebar(leaf.containerEl);
        }
        
        return isPinned || isInSidebar;
    }
    
    async setupLeafDetachIntercept() {
        try {
            this.app.workspace.iterateAllLeaves(leaf => {
                this.hookLeafDetach(leaf);
            });
            
            this.registerEvent(
                this.app.workspace.on('layout-change', () => {
                    this.app.workspace.iterateAllLeaves(leaf => {
                        this.hookLeafDetach(leaf);
                    });
                })
            );
        } catch (error) {
        }
    }
    
    hookLeafDetach(leaf) {
        if (!leaf || leaf._preventCloseHooked) return;
        
        leaf._preventCloseHooked = true;
        leaf._originalDetach = leaf.detach;
        
        leaf.detach = () => {
            if (this.shouldPreventClose(leaf) && !this.allowContextMenuClose) {
                return false;
            }
            return leaf._originalDetach.call(leaf);
        };
    }
    
    onunload() {
        if (this.originalCommand) {
            const commandId = 'workspace:close';
            this.app.commands.removeCommand(commandId);
            this.app.commands.addCommand(this.originalCommand);
        }
        
        this.app.workspace.iterateAllLeaves(leaf => {
            if (leaf._originalDetach) {
                leaf.detach = leaf._originalDetach;
                delete leaf._originalDetach;
                delete leaf._preventCloseHooked;
            }
        });
    }
}

module.exports = DisableHotkeysPlugin;
