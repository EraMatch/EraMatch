import svgPaths from "./svg-mposaf0aua";
import clsx from "clsx";
import imgImageEramatch from "../assets/image-eramatch.png";
type ButtonProps = {
  additionalClassNames?: string;
};

function Button({ children, additionalClassNames = "" }: React.PropsWithChildren<ButtonProps>) {
  return (
    <div className={clsx("h-[50.333px] relative shrink-0", additionalClassNames)}>
      <div aria-hidden="true" className="absolute border-[0px_0px_1.333px] border-[rgba(0,0,0,0)] border-solid inset-0 pointer-events-none" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">{children}</div>
    </div>
  );
}

function Wrapper4({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="h-[24px] relative shrink-0 w-full">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#111827] text-[16px] text-nowrap top-[-1.67px]">{children}</p>
    </div>
  );
}
type Wrapper3Props = {
  additionalClassNames?: string;
};

function Wrapper3({ children, additionalClassNames = "" }: React.PropsWithChildren<Wrapper3Props>) {
  return (
    <div className={clsx("h-[24px] relative shrink-0", additionalClassNames)}>
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">{children}</div>
    </div>
  );
}

function Wrapper2({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="basis-0 grow h-[21px] min-h-px min-w-px relative shrink-0">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">{children}</div>
    </div>
  );
}
type Wrapper1Props = {
  additionalClassNames?: string;
};

function Wrapper1({ children, additionalClassNames = "" }: React.PropsWithChildren<Wrapper1Props>) {
  return (
    <div className={clsx("size-[16px]", additionalClassNames)}>
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        {children}
      </svg>
    </div>
  );
}
type Icon2Props = {
  additionalClassNames?: string;
};

function Icon2({ children, additionalClassNames = "" }: React.PropsWithChildren<Icon2Props>) {
  return (
    <div className={clsx("absolute size-[32px]", additionalClassNames)}>
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 32 32">
        <g id="Icon">{children}</g>
      </svg>
    </div>
  );
}
type Container1Props = {
  additionalClassNames?: string;
};

function Container1({ children, additionalClassNames = "" }: React.PropsWithChildren<Container1Props>) {
  return (
    <div className={clsx("bg-[#f9fafb] relative rounded-[8px] shrink-0 w-full", additionalClassNames)}>
      <div className="size-full">
        <div className="content-stretch flex flex-col items-start pb-0 pt-[16px] px-[16px] relative size-full">{children}</div>
      </div>
    </div>
  );
}
type ContainerProps = {
  additionalClassNames?: string;
};

function Container({ children, additionalClassNames = "" }: React.PropsWithChildren<ContainerProps>) {
  return (
    <div className={clsx("relative shrink-0 w-full", additionalClassNames)}>
      <div className="size-full">
        <div className="content-stretch flex items-start justify-between relative size-full">{children}</div>
      </div>
    </div>
  );
}
type Icon1Props = {
  additionalClassNames?: string;
};

function Icon1({ children, additionalClassNames = "" }: React.PropsWithChildren<Icon1Props>) {
  return (
    <div className={clsx("size-[20px]", additionalClassNames)}>
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20 20">
        <g id="Icon">{children}</g>
      </svg>
    </div>
  );
}
type WrapperProps = {
  additionalClassNames?: string;
};

function Wrapper({ children, additionalClassNames = "" }: React.PropsWithChildren<WrapperProps>) {
  return (
    <Wrapper1 additionalClassNames={additionalClassNames}>
      <g id="Icon">{children}</g>
    </Wrapper1>
  );
}
type TextText3Props = {
  text: string;
};

function TextText3({ text }: TextText3Props) {
  return (
    <div className="absolute h-[24px] left-[80px] opacity-0 top-[20px] w-[57.813px]">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[29px] text-[#4834ab] text-[16px] text-center text-nowrap top-[-0.33px] translate-x-[-50%]">{text}</p>
    </div>
  );
}
type TextText2Props = {
  text: string;
};

function TextText2({ text }: TextText2Props) {
  return (
    <Wrapper3 additionalClassNames="w-[44.5px]">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#6366f1] text-[16px] top-[-0.33px] w-[45px]">{text}</p>
    </Wrapper3>
  );
}
type TextText1Props = {
  text: string;
};

function TextText1({ text }: TextText1Props) {
  return (
    <Wrapper2>
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-0 text-[#111827] text-[14px] text-nowrap top-[-0.67px]">{text}</p>
    </Wrapper2>
  );
}
type ContainerText2Props = {
  text: string;
};

function ContainerText2({ text }: ContainerText2Props) {
  return (
    <div className="h-[24px] relative shrink-0 w-full">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#111827] text-[16px] text-nowrap top-[-0.33px]">{text}</p>
    </div>
  );
}

function Icon() {
  return (
    <Wrapper additionalClassNames="absolute left-[20px] top-[16.5px]">
      <path d={svgPaths.p28b0a6c0} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
      <path d={svgPaths.p2f10900} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
      <path d="M6.66667 6H5.33333" id="Vector_3" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
      <path d="M10.6667 8.66667H5.33333" id="Vector_4" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
      <path d="M10.6667 11.3333H5.33333" id="Vector_5" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
    </Wrapper>
  );
}
type ContainerText1Props = {
  text: string;
};

function ContainerText1({ text }: ContainerText1Props) {
  return (
    <div className="h-[36px] relative shrink-0 w-full">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[36px] left-0 text-[#111827] text-[24px] text-nowrap top-[-2.67px]">{text}</p>
    </div>
  );
}
type ContainerTextProps = {
  text: string;
};

function ContainerText({ text }: ContainerTextProps) {
  return (
    <div className="h-[18px] relative shrink-0 w-full">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[18px] left-0 text-[#6b7280] text-[12px] text-nowrap top-[-0.67px]">{text}</p>
    </div>
  );
}
type TextTextProps = {
  text: string;
};

function TextText({ text }: TextTextProps) {
  return (
    <Wrapper2>
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-0 text-[#6b7280] text-[14px] text-nowrap top-[-0.67px]">{text}</p>
    </Wrapper2>
  );
}
type HeadingTextProps = {
  text: string;
};

function HeadingText({ text }: HeadingTextProps) {
  return <Wrapper4>{text}</Wrapper4>;
}

export default function EraMatchCombinedUiPreFinal() {
  return (
    <div className="bg-white relative size-full" data-name="EraMatch Combined UI - PreFinal">
      <div className="absolute bg-[#edf0f8] content-stretch flex flex-col h-[1214.667px] items-start left-0 pl-[96px] pr-0 py-0 top-0 w-[2180px]" data-name="App">
        <div className="bg-[#edf0f8] h-[90px] relative shrink-0 w-full" data-name="Header">
          <div className="flex flex-row items-center size-full">
            <div className="content-stretch flex items-center justify-between px-[32px] py-0 relative size-full">
              <div className="h-[40px] relative shrink-0 w-[201.188px]" data-name="Image (ERAMATCH)">
                <img alt="" className="absolute bg-clip-padding border-0 border-[transparent] border-solid inset-0 max-w-none object-50%-50% object-cover pointer-events-none size-full" src={imgImageEramatch} />
              </div>
              <div className="h-[42px] relative shrink-0 w-[161.396px]" data-name="Container">
                <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[16px] items-center relative size-full">
                  <div className="relative rounded-[10px] shrink-0 size-[36px]" data-name="Container">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute left-[8px] size-[20px] top-[8px]" data-name="Notifications">
                        <Icon1 additionalClassNames="absolute left-0 top-0">
                          <path d={svgPaths.p1c3efea0} id="Vector" stroke="var(--stroke-0, #18BA84)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
                          <path d={svgPaths.p25877f40} id="Vector_2" stroke="var(--stroke-0, #18BA84)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
                        </Icon1>
                        <div className="absolute bg-[#ef4444] content-stretch flex items-center justify-center left-[8px] rounded-[4.47392e+07px] size-[16px] top-[-4px]" data-name="Text">
                          <p className="font-['Arimo:Regular',sans-serif] font-normal leading-[15px] relative shrink-0 text-[10px] text-center text-nowrap text-white">3</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="h-[42px] relative rounded-[4.47392e+07px] shrink-0 w-[109.396px]" data-name="Button">
                    <div aria-hidden="true" className="absolute border-[#c63434] border-[1.333px] border-solid inset-0 pointer-events-none rounded-[4.47392e+07px]" />
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center px-[25.333px] py-[1.333px] relative size-full">
                      <p className="font-['Arimo:Regular',sans-serif] font-normal leading-[24px] relative shrink-0 text-[#c63434] text-[16px] text-center text-nowrap">Sign out</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-[#f9fafb] h-[984px] relative shrink-0 w-full" data-name="CandidateProfile">
          <div className="overflow-clip rounded-[inherit] size-full">
            <div className="content-stretch flex flex-col items-start px-[342px] py-0 relative size-full">
              <div className="h-[984px] relative shrink-0 w-full" data-name="Container">
                <div className="absolute content-stretch flex gap-[8px] h-[21px] items-center left-[48px] top-[24px] w-[59.125px]" data-name="Button">
                  <Icon1 additionalClassNames="relative shrink-0">
                    <path d="M12.5 15L7.5 10L12.5 5" id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
                  </Icon1>
                  <Wrapper2>
                    <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[16px] text-[#6b7280] text-[14px] text-center text-nowrap top-[-0.67px] translate-x-[-50%]">Back</p>
                  </Wrapper2>
                </div>
                <div className="absolute bg-white content-stretch flex flex-col h-[257.667px] items-start left-[48px] pb-[1.333px] pt-[33.333px] px-[33.333px] rounded-[12px] top-[69px] w-[1304px]" data-name="Container">
                  <div aria-hidden="true" className="absolute border-[#e5e7eb] border-[1.333px] border-solid inset-0 pointer-events-none rounded-[12px]" />
                  <div className="content-stretch flex gap-[24px] h-[191px] items-start relative shrink-0 w-full" data-name="Container">
                    <div className="bg-gradient-to-b from-[#6366f1] relative rounded-[16px] shrink-0 size-[100px] to-[#8b5cf6]" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center relative size-full">
                        <p className="font-['Arimo:Regular',sans-serif] font-normal leading-[54px] relative shrink-0 text-[36px] text-nowrap text-white">JS</p>
                      </div>
                    </div>
                    <div className="basis-0 grow h-[191px] min-h-px min-w-px relative shrink-0" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[16px] items-start relative size-full">
                        <Container additionalClassNames="h-[85px]">
                          <div className="h-[85px] relative shrink-0 w-[478.146px]" data-name="Container">
                            <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[4px] items-start relative size-full">
                              <HeadingText text="John Smith" />
                              <div className="h-[24px] relative shrink-0 w-full" data-name="Paragraph">
                                <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#6b7280] text-[16px] text-nowrap top-[-0.33px]">Senior Full Stack Developer</p>
                              </div>
                              <div className="h-[21px] relative shrink-0 w-full" data-name="Container">
                                <div className="absolute content-stretch flex gap-[8px] h-[21px] items-center left-0 top-0 w-[165.813px]" data-name="Container">
                                  <Wrapper additionalClassNames="relative shrink-0">
                                    <path d={svgPaths.p2f8e7e80} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                                    <path d={svgPaths.p17070980} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                                  </Wrapper>
                                  <TextText text="john.smith@email.com" />
                                </div>
                                <div className="absolute content-stretch flex gap-[8px] h-[21px] items-center left-[181.81px] top-0 w-[139.604px]" data-name="Container">
                                  <Wrapper1 additionalClassNames="relative shrink-0">
                                    <g clipPath="url(#clip0_4068_627)" id="Icon">
                                      <path d={svgPaths.p26187580} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                                    </g>
                                    <defs>
                                      <clipPath id="clip0_4068_627">
                                        <rect fill="white" height="16" width="16" />
                                      </clipPath>
                                    </defs>
                                  </Wrapper1>
                                  <TextText text="+1 (555) 123-4567" />
                                </div>
                                <div className="absolute content-stretch flex gap-[8px] h-[21px] items-center left-[337.42px] top-0 w-[140.729px]" data-name="Container">
                                  <Wrapper additionalClassNames="relative shrink-0">
                                    <path d={svgPaths.p14548f00} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                                    <path d={svgPaths.p17781bc0} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                                  </Wrapper>
                                  <TextText text="San Francisco, CA" />
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="h-[40px] relative rounded-[8px] shrink-0 w-[184.958px]" data-name="Button">
                            <div aria-hidden="true" className="absolute border-[#e5e7eb] border-[1.333px] border-solid inset-0 pointer-events-none rounded-[8px]" />
                            <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center pl-[21.333px] pr-[1.333px] py-[1.333px] relative size-full">
                              <Wrapper additionalClassNames="relative shrink-0">
                                <path d="M8 10V2" id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                                <path d={svgPaths.p23ad1400} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                                <path d={svgPaths.p19411800} id="Vector_3" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                              </Wrapper>
                              <div className="h-[21px] relative shrink-0 w-[118.292px]" data-name="Text">
                                <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                                  <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[59.5px] text-[#374151] text-[14px] text-center text-nowrap top-[-0.67px] translate-x-[-50%]">Download Resume</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </Container>
                        <div className="h-[90px] relative shrink-0 w-full" data-name="Container">
                          <div className="absolute bg-[#f9fafb] content-stretch flex flex-col gap-[4px] h-[90px] items-start left-0 pb-0 pt-[16px] px-[16px] rounded-[8px] top-0 w-[266.333px]" data-name="Container">
                            <ContainerText text="Overall Score" />
                            <ContainerText1 text="95" />
                          </div>
                          <div className="absolute bg-[#f9fafb] content-stretch flex flex-col gap-[4px] h-[90px] items-start left-[282.33px] pb-0 pt-[16px] px-[16px] rounded-[8px] top-0 w-[266.333px]" data-name="Container">
                            <ContainerText text="Assessment" />
                            <ContainerText1 text="95" />
                          </div>
                          <div className="absolute bg-[#f9fafb] content-stretch flex flex-col gap-[4px] h-[90px] items-start left-[564.67px] pb-0 pt-[16px] px-[16px] rounded-[8px] top-0 w-[266.333px]" data-name="Container">
                            <ContainerText text="AI Interview" />
                            <ContainerText1 text="92" />
                          </div>
                          <div className="absolute bg-[#f9fafb] content-stretch flex flex-col gap-[4px] h-[90px] items-start left-[847px] pb-0 pt-[16px] px-[16px] rounded-[8px] top-0 w-[266.333px]" data-name="Container">
                            <ContainerText text="GitHub" />
                            <ContainerText1 text="88" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bg-white border-[#e5e7eb] border-[1.333px] border-solid h-[609.333px] left-[48px] overflow-clip rounded-[12px] top-[350.67px] w-[1304px]" data-name="Container">
                  <div className="absolute content-stretch flex flex-col h-[71.667px] items-start left-0 pb-[1.333px] pt-0 px-[24px] top-0 w-[1301.333px]" data-name="Container">
                    <div aria-hidden="true" className="absolute border-[#e5e7eb] border-[0px_0px_1.333px] border-solid inset-0 pointer-events-none" />
                    <div className="content-stretch flex gap-[4px] h-[70.333px] items-start overflow-clip relative shrink-0 w-full" data-name="Container">
                      <Button additionalClassNames="w-[122.354px]">
                        <Icon />
                        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[73.5px] text-[#6b7280] text-[14px] text-center text-nowrap top-[13.33px] translate-x-[-50%]">Overview</p>
                      </Button>
                      <Button additionalClassNames="w-[116.146px]">
                        <Icon />
                        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[70.5px] text-[#6b7280] text-[14px] text-center text-nowrap top-[13.33px] translate-x-[-50%]">Resume</p>
                      </Button>
                      <Button additionalClassNames="w-[107.583px]">
                        <Wrapper additionalClassNames="absolute left-[20px] top-[16.5px]">
                          <path d={svgPaths.pe485a00} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                          <path d={svgPaths.p28ae6680} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                        </Wrapper>
                        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[66px] text-[#6b7280] text-[14px] text-center text-nowrap top-[13.33px] translate-x-[-50%]">GitHub</p>
                      </Button>
                      <Button additionalClassNames="w-[116.938px]">
                        <Wrapper additionalClassNames="absolute left-[20px] top-[16.5px]">
                          <path d={svgPaths.p14dc0c00} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                          <path d="M4 6H1.33333V14H4V6Z" id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                          <path d={svgPaths.p342eb800} id="Vector_3" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                        </Wrapper>
                        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[70.5px] text-[#6b7280] text-[14px] text-center text-nowrap top-[13.33px] translate-x-[-50%]">LinkedIn</p>
                      </Button>
                      <Button additionalClassNames="w-[140.25px]">
                        <Wrapper additionalClassNames="absolute left-[20px] top-[16.5px]">
                          <path d={svgPaths.p90824c0} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                          <path d="M12 11.3333V6" id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                          <path d="M8.66667 11.3333V3.33333" id="Vector_3" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                          <path d="M5.33333 11.3333V9.33333" id="Vector_4" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                        </Wrapper>
                        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[82.5px] text-[#6b7280] text-[14px] text-center text-nowrap top-[13.33px] translate-x-[-50%]">Assessment</p>
                      </Button>
                      <Button additionalClassNames="w-[137.146px]">
                        <Wrapper additionalClassNames="absolute left-[20px] top-[16.5px]">
                          <path d={svgPaths.p144f51c0} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                          <path d={svgPaths.p1e94b080} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                        </Wrapper>
                        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[81px] text-[#6b7280] text-[14px] text-center text-nowrap top-[13.33px] translate-x-[-50%]">AI Interview</p>
                      </Button>
                      <div className="h-[50.333px] relative shrink-0 w-[149.604px]" data-name="Button">
                        <div aria-hidden="true" className="absolute border-[#6366f1] border-[0px_0px_1.333px] border-solid inset-0 pointer-events-none" />
                        <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                          <Wrapper additionalClassNames="absolute left-[20px] top-[16.5px]">
                            <path d={svgPaths.p36f329f0} id="Vector" stroke="var(--stroke-0, #6366F1)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                          </Wrapper>
                          <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[87px] text-[#6366f1] text-[14px] text-center text-nowrap top-[13.33px] translate-x-[-50%]">Live Interview</p>
                        </div>
                      </div>
                      <Button additionalClassNames="w-[100.583px]">
                        <Wrapper additionalClassNames="absolute left-[20px] top-[16.5px]">
                          <path d={svgPaths.p3dcf1000} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                        </Wrapper>
                        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[62.5px] text-[#6b7280] text-[14px] text-center text-nowrap top-[13.33px] translate-x-[-50%]">Notes</p>
                      </Button>
                      <Button additionalClassNames="w-[176.083px]">
                        <Wrapper1 additionalClassNames="absolute left-[20px] top-[16.5px]">
                          <g clipPath="url(#clip0_4068_654)" id="Icon">
                            <path d={svgPaths.p2f327a00} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                            <path d={svgPaths.p1cd74100} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                            <path d={svgPaths.pe9cb400} id="Vector_3" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                            <path d={svgPaths.p345da6c0} id="Vector_4" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                            <path d="M8 8V5.33333" id="Vector_5" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                          </g>
                          <defs>
                            <clipPath id="clip0_4068_654">
                              <rect fill="white" height="16" width="16" />
                            </clipPath>
                          </defs>
                        </Wrapper1>
                        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[100.5px] text-[#6b7280] text-[14px] text-center text-nowrap top-[13.33px] translate-x-[-50%]">Knowledge Graph</p>
                      </Button>
                      <Button additionalClassNames="w-[140.271px]">
                        <Wrapper1 additionalClassNames="absolute left-[20px] top-[16.5px]">
                          <g clipPath="url(#clip0_4068_646)" id="Icon">
                            <path d={svgPaths.p34e03900} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                            <path d={svgPaths.p1f2c5400} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
                          </g>
                          <defs>
                            <clipPath id="clip0_4068_646">
                              <rect fill="white" height="16" width="16" />
                            </clipPath>
                          </defs>
                        </Wrapper1>
                        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[82.5px] text-[#6b7280] text-[14px] text-center text-nowrap top-[13.33px] translate-x-[-50%]">Final Report</p>
                      </Button>
                    </div>
                  </div>
                  <div className="absolute content-stretch flex flex-col gap-[24px] h-[471px] items-start left-[32px] top-[103.67px] w-[1237.333px]" data-name="Container">
                    <div className="h-[78px] relative shrink-0 w-full" data-name="Container">
                      <div className="absolute bg-[#f9fafb] content-stretch flex flex-col gap-[4px] h-[78px] items-start left-0 pb-0 pt-[16px] px-[16px] rounded-[8px] top-0 w-[610.667px]" data-name="Container">
                        <ContainerText text="Completed" />
                        <ContainerText2 text="2025-01-16" />
                      </div>
                      <div className="absolute bg-[#f9fafb] content-stretch flex flex-col gap-[4px] h-[78px] items-start left-[626.67px] pb-0 pt-[16px] px-[16px] rounded-[8px] top-0 w-[610.667px]" data-name="Container">
                        <ContainerText text="Duration" />
                        <ContainerText2 text="30 minutes" />
                      </div>
                    </div>
                    <div className="content-stretch flex flex-col gap-[16px] h-[256px] items-start relative shrink-0 w-full" data-name="Container">
                      <Wrapper4>{`Questions & Scores`}</Wrapper4>
                      <div className="content-stretch flex flex-col gap-[12px] h-[216px] items-start relative shrink-0 w-full" data-name="Container">
                        <Container1 additionalClassNames="h-[64px]">
                          <div className="content-stretch flex h-[24px] items-start justify-between relative shrink-0 w-full" data-name="Container">
                            <TextText1 text="Tell me about your experience with React" />
                            <TextText2 text="9.5/10" />
                          </div>
                        </Container1>
                        <Container1 additionalClassNames="h-[64px]">
                          <Container additionalClassNames="h-[24px]">
                            <TextText1 text="How do you handle state management?" />
                            <Wrapper3 additionalClassNames="w-[31.167px]">
                              <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#6366f1] text-[16px] top-[-0.33px] w-[32px]">9/10</p>
                            </Wrapper3>
                          </Container>
                        </Container1>
                        <Container1 additionalClassNames="h-[64px]">
                          <div className="content-stretch flex h-[24px] items-start justify-between relative shrink-0 w-full" data-name="Container">
                            <TextText1 text="Describe your deployment process" />
                            <TextText2 text="8.8/10" />
                          </div>
                        </Container1>
                      </div>
                    </div>
                    <div className="content-stretch flex flex-col gap-[12px] h-[89px] items-start relative shrink-0 w-full" data-name="Container">
                      <HeadingText text="Overall Feedback" />
                      <Container1 additionalClassNames="h-[53px]">
                        <div className="h-[21px] relative shrink-0 w-full" data-name="Paragraph">
                          <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-0 text-[#374151] text-[14px] text-nowrap top-[-0.67px]">Excellent technical knowledge and communication skills. Strong problem-solving abilities.</p>
                        </div>
                      </Container1>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bg-[#f7fafe] h-[1214.667px] left-0 overflow-clip rounded-br-[24px] rounded-tr-[24px] top-0 w-[96px]" data-name="Sidebar">
        <div className="absolute left-[16px] overflow-clip rounded-[24px] size-[64px] top-[415.33px]" data-name="Button">
          <Icon2 additionalClassNames="left-[16px] top-[16px]">
            <path d={svgPaths.p3b973d80} id="Vector" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
            <path d={svgPaths.p12632700} id="Vector_2" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
          </Icon2>
          <div className="absolute h-[24px] left-[80px] opacity-0 top-[20px] w-[42.688px]" data-name="Text">
            <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[21.5px] text-[#4834ab] text-[16px] text-center text-nowrap top-[-0.33px] translate-x-[-50%]">Home</p>
          </div>
        </div>
        <div className="absolute left-[16px] overflow-clip rounded-[24px] size-[64px] top-[495.33px]" data-name="Button">
          <Icon2 additionalClassNames="left-[16px] top-[16px]">
            <path d={svgPaths.p1bddf080} id="Vector" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
            <path d={svgPaths.p28e98400} id="Vector_2" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
          </Icon2>
          <TextText3 text="Projects" />
        </div>
        <div className="absolute left-[16px] overflow-clip rounded-[24px] size-[64px] top-[575.33px]" data-name="Button">
          <div className="absolute left-[16px] size-[32px] top-[16px]" data-name="Container">
            <Icon2 additionalClassNames="left-0 top-0">
              <path d={svgPaths.p122cc440} id="Vector" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
              <path d={svgPaths.p3f854900} id="Vector_2" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
            </Icon2>
            <div className="absolute bg-[#ef4444] content-stretch flex items-center justify-center left-[18px] pl-0 pr-[0.021px] py-0 rounded-[4.47392e+07px] size-[18px] top-[-4px]" data-name="Container">
              <div className="h-[15px] relative shrink-0 w-[5.563px]" data-name="Text">
                <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                  <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[15px] left-[3px] text-[10px] text-center text-nowrap text-white top-[-0.67px] translate-x-[-50%]">3</p>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute h-[24px] left-[80px] opacity-0 top-[20px] w-[40.917px]" data-name="Text">
            <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[20.5px] text-[#4834ab] text-[16px] text-center text-nowrap top-[-0.33px] translate-x-[-50%]">Alerts</p>
          </div>
        </div>
        <div className="absolute left-[16px] overflow-clip rounded-[24px] size-[64px] top-[655.33px]" data-name="Button">
          <Icon2 additionalClassNames="left-[16px] top-[16px]">
            <path d={svgPaths.p27a3200} id="Vector" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
            <path d={svgPaths.pdc20e80} id="Vector_2" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
            <path d={svgPaths.p18f42980} id="Vector_3" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
            <path d={svgPaths.p2ee517c0} id="Vector_4" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
          </Icon2>
          <div className="absolute h-[24px] left-[80px] opacity-0 top-[20px] w-[80.958px]" data-name="Text">
            <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[40px] text-[#4834ab] text-[16px] text-center text-nowrap top-[-0.33px] translate-x-[-50%]">Candidates</p>
          </div>
        </div>
        <div className="absolute left-[16px] overflow-clip rounded-[24px] size-[64px] top-[735.33px]" data-name="Button">
          <Icon2 additionalClassNames="left-[16px] top-[16px]">
            <path d={svgPaths.pad4aa00} id="Vector" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
            <path d={svgPaths.p34392700} id="Vector_2" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
          </Icon2>
          <TextText3 text="Settings" />
        </div>
      </div>
    </div>
  );
}