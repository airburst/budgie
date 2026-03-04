import { ChartNoAxesCombinedIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const setActiveAccount = (account: string) => {
  console.log(
    "%c🤪 ~ file: side-menu.tsx -> Set active account : ",
    "color: #818a88",
    account,
  );
};

export default function SideMenu() {
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <ChartNoAxesCombinedIcon />
                  <span>Budgie</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Accounts</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <button
                      aria-label="Current account"
                      onClick={() => setActiveAccount("home")}
                    />
                  }
                >
                  <span>Current</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <button
                      aria-label="Joint account"
                      onClick={() => setActiveAccount("joint")}
                    />
                  }
                >
                  <span>Joint</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <button
                      aria-label="Savings account"
                      onClick={() => setActiveAccount("savings")}
                    />
                  }
                >
                  <span>Savings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
